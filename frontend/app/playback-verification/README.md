Development-only fixture at http://localhost:3000/playback-verification?playbackTrace

The fixture is a separate in-memory project; it never calls project/timeline mutation APIs. Production requests to the page return notFound. Select mixed, video, image, text or image-audio-text.

Generated assets can be reproduced from the repository root with FFmpeg:

ffmpeg -f lavfi -i testsrc2=size=640x360:rate=30 -t 12 -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -movflags +faststart frontend/public/playback-fixtures/clock.mp4
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=16000 -t 80 -c:a pcm_s16le frontend/public/playback-fixtures/tone.wav

still.svg is a simple local test image. The mixed fixture contains a silent, empty timeline gap at 27–30 seconds and ends at 80 seconds.
