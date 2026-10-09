param([string]$Mode='baseline',[int]$LimitMB=0,[switch]$OneCore,[switch]$Controller)
$ErrorActionPreference='Stop'
$benchDir=Join-Path $PSScriptRoot 'results'
$manifest=Get-Content -LiteralPath (Join-Path $benchDir "$Mode-command.json") -Raw | ConvertFrom-Json
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
 public static double Cpu(IntPtr j){Accounting a;if(!QueryInformationJobObject(j,1,out a,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero))throw new Exception("Job CPU query failed");return (a.User+a.Kernel)/10000000.0;}
 public static ulong Peak(IntPtr j){Limits l;if(!QueryInformationJobObject(j,9,out l,(uint)Marshal.SizeOf(typeof(Limits)),IntPtr.Zero))throw new Exception("Job memory query failed");return l.PeakJob.ToUInt64();}
}
"@
$job=[ExportMemoryJob]::Create([uint64]$LimitMB*1MB)
$p=[Diagnostics.Process]::new();$p.StartInfo.FileName=if($Controller){(Get-Command node).Source}else{(Get-Command ffmpeg).Source}
$p.StartInfo.WorkingDirectory=$benchDir;$p.StartInfo.UseShellExecute=$false;$p.StartInfo.CreateNoWindow=$true
$p.StartInfo.RedirectStandardOutput=$true;$p.StartInfo.RedirectStandardError=$true
if($Controller){foreach($arg in @((Join-Path $PSScriptRoot 'storytellingFixture.cjs'),$Mode,[string]$manifest.duration,'render')){$p.StartInfo.ArgumentList.Add($arg)}}
else{foreach($arg in $manifest.args){$p.StartInfo.ArgumentList.Add([string]$arg)}}
$timer=[Diagnostics.Stopwatch]::StartNew();$peakWorking=0L;$peakPrivate=0L
try {
 if(-not $p.Start()){throw 'FFmpeg did not start'}
 if(-not [ExportMemoryJob]::AssignProcessToJobObject($job,$p.Handle)){throw 'Cannot assign benchmark memory job'}
 if($OneCore){$p.ProcessorAffinity=[IntPtr]1}
 [ExportMemoryJob]::Capture($p,(Join-Path $benchDir "$Mode-progress.log"),(Join-Path $benchDir "$Mode-stderr.log"))
 while(-not $p.WaitForExit(20)){$p.Refresh();$peakWorking=[Math]::Max($peakWorking,$p.PeakWorkingSet64);$peakPrivate=[Math]::Max($peakPrivate,$p.PrivateMemorySize64)}
 $p.WaitForExit();$p.Refresh();$timer.Stop();$peakWorking=[Math]::Max($peakWorking,$p.PeakWorkingSet64)
 $result=[ordered]@{mode=$Mode;controller=[bool]$Controller;limitMB=$LimitMB;oneCore=[bool]$OneCore;exitCode=$p.ExitCode;durationSeconds=[Math]::Round($timer.Elapsed.TotalSeconds,3);jobCpuSeconds=[ExportMemoryJob]::Cpu($job);parentCpuSeconds=$p.TotalProcessorTime.TotalSeconds;peakJobCommitBytes=[ExportMemoryJob]::Peak($job);peakWorkingSetBytes=$peakWorking;sampledPeakPrivateBytes=$peakPrivate;platform=if($Controller){'Windows Job Object; controller Node + FFmpeg child, mocked DB/storage'}else{'Windows Job Object; FFmpeg process only'};sampleIntervalMs=20}
 $json=$result|ConvertTo-Json;$suffix=if($Controller){'controller'}else{'ffmpeg'};$json|Set-Content -LiteralPath (Join-Path $benchDir "$Mode-$suffix-memory.json");$json
}finally{[ExportMemoryJob]::CloseHandle($job)|Out-Null;$p.Dispose()}
