$ErrorActionPreference='Stop'
$benchDir=Join-Path $PSScriptRoot 'results'
$runName='predeploy-envelope-'+[guid]::NewGuid().ToString('N')
Add-Type -TypeDefinition @"
using System; using System.IO; using System.Diagnostics; using System.Runtime.InteropServices;
public static class ExportMemoryJob {
 [StructLayout(LayoutKind.Sequential)] public struct Basic { public long A,B; public uint Flags; public UIntPtr Min,Max; public uint Processes; public UIntPtr Affinity; public uint Priority,Scheduling; }
 [StructLayout(LayoutKind.Sequential)] public struct IO { public ulong A,B,C,D,E,F; }
 [StructLayout(LayoutKind.Sequential)] public struct Limits { public Basic Basic; public IO IO; public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob; }
 [StructLayout(LayoutKind.Sequential)] public struct Accounting { public long User,Kernel,PeriodUser,PeriodKernel; public uint Faults,Processes,Active,Terminated; }
 [DllImport("kernel32.dll")] public static extern bool QueryInformationJobObject(IntPtr job,int info,out Accounting a,uint size,IntPtr written);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr a,string name);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int info,ref Limits limits,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool QueryInformationJobObject(IntPtr job,int info,out Limits limits,uint size,IntPtr written);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
 public static IntPtr Create(ulong bytes) { var j=CreateJobObject(IntPtr.Zero,null); var l=new Limits(); l.Basic.Flags=0x2000; if(bytes>0){l.Basic.Flags|=0x200; l.JobMemory=(UIntPtr)bytes;} if(!SetInformationJobObject(j,9,ref l,(uint)Marshal.SizeOf(l)))throw new Exception("Job memory limit setup failed"); return j; }
 public static void Capture(Process p,string output,string error){File.WriteAllText(output, "");File.WriteAllText(error, "");p.OutputDataReceived+=(s,e)=>{if(e.Data!=null)File.AppendAllText(output,e.Data+Environment.NewLine);};p.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)File.AppendAllText(error,e.Data+Environment.NewLine);};p.BeginOutputReadLine();p.BeginErrorReadLine();}
 [DllImport("kernel32.dll", EntryPoint="QueryInformationJobObject")] public static extern bool QueryIds(IntPtr job,int info,IntPtr data,uint size,IntPtr written);
 public static int[] Ids(IntPtr j){IntPtr b=Marshal.AllocHGlobal(4096);try{if(!QueryIds(j,3,b,4096,IntPtr.Zero))throw new Exception("Job process query failed");int n=Marshal.ReadInt32(b,4);int[] ids=new int[n];for(int i=0;i<n;i++)ids[i]=(int)Marshal.ReadIntPtr(b,8+i*IntPtr.Size);return ids;}finally{Marshal.FreeHGlobal(b);}}
 public static double Cpu(IntPtr j){Accounting a;if(!QueryInformationJobObject(j,1,out a,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero))throw new Exception("Job CPU query failed");return (a.User+a.Kernel)/10000000.0;}
 public static ulong Peak(IntPtr j){Limits l;if(!QueryInformationJobObject(j,9,out l,(uint)Marshal.SizeOf(typeof(Limits)),IntPtr.Zero))throw new Exception("Job memory query failed");return l.PeakJob.ToUInt64();}
}
"@

$job=[ExportMemoryJob]::Create(1024MB)
$p=[Diagnostics.Process]::new()
$p.StartInfo.FileName=(Get-Command node).Source
$p.StartInfo.WorkingDirectory=(Split-Path $PSScriptRoot)
$p.StartInfo.UseShellExecute=$false
$p.StartInfo.CreateNoWindow=$true
$p.StartInfo.RedirectStandardOutput=$true
$p.StartInfo.RedirectStandardError=$true
$p.StartInfo.Environment['PREDEPLOY_KEEP_SERVER']='false'
$p.StartInfo.ArgumentList.Add((Join-Path $PSScriptRoot 'predeployLocal.cjs'))
$timer=[Diagnostics.Stopwatch]::StartNew()
$nodePeak=0L;$ffmpegPeak=0L;$backendPeak=0L;$combinedRss=0L
$samples=Join-Path $benchDir "$runName-samples.jsonl"
try {
 if(-not $p.Start()){throw 'Harness start failed'}
 if(-not [ExportMemoryJob]::AssignProcessToJobObject($job,$p.Handle)){throw 'Cannot assign test resource job'}
 $p.ProcessorAffinity=[IntPtr]1
 [ExportMemoryJob]::Capture($p,(Join-Path $benchDir "$runName-output.log"),(Join-Path $benchDir "$runName-error.log"))
 while(-not $p.WaitForExit(100)){
  $rss=0L;$nodes=0L;$ffmpeg=0L;$backend=0L
  foreach($id in [ExportMemoryJob]::Ids($job)){
   try{$process=[Diagnostics.Process]::GetProcessById($id);$process.Refresh();$rss+=$process.WorkingSet64
    if($process.ProcessName -eq 'node'){$nodes+=$process.WorkingSet64;if($id -ne $p.Id){$backend=[Math]::Max($backend,$process.PeakWorkingSet64)}}
    if($process.ProcessName -eq 'ffmpeg'){$ffmpeg=[Math]::Max($ffmpeg,$process.PeakWorkingSet64)}
    $process.Dispose()
   }catch [ArgumentException]{}catch [InvalidOperationException]{}
  }
  $nodePeak=[Math]::Max($nodePeak,$nodes);$backendPeak=[Math]::Max($backendPeak,$backend);$ffmpegPeak=[Math]::Max($ffmpegPeak,$ffmpeg);$combinedRss=[Math]::Max($combinedRss,$rss)
  @{at=[DateTime]::UtcNow.ToString('o');nodeRss=$nodes;backendPeakRss=$backend;ffmpegPeakRss=$ffmpeg;combinedRss=$rss;jobCpu=[ExportMemoryJob]::Cpu($job);jobCommitPeak=[ExportMemoryJob]::Peak($job)}|ConvertTo-Json -Compress|Add-Content -LiteralPath $samples
 }
 $p.WaitForExit();$timer.Stop()
 $result=@{run=$runName;exitCode=$p.ExitCode;limitMiB=1024;affinityLogicalCpus=1;durationSeconds=$timer.Elapsed.TotalSeconds;jobCpuSeconds=[ExportMemoryJob]::Cpu($job);peakJobCommitBytes=[ExportMemoryJob]::Peak($job);sampledPeakCombinedRssBytes=$combinedRss;sampledPeakNodeRssBytes=$nodePeak;peakBackendNodeRssBytes=$backendPeak;peakFFmpegRssBytes=$ffmpegPeak;sampleIntervalMs=100;limitation='Windows Job Object commit limit, not Linux cgroup; includes API harness and owned backend processes; PostgreSQL outside job'}
 $result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $benchDir "$runName-memory.json")
 $result|ConvertTo-Json
}finally{[ExportMemoryJob]::CloseHandle($job)|Out-Null;$p.Dispose()}
