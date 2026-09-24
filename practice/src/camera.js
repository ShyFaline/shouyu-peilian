/** 停摄像头：停 tracks、清空 srcObject。可再开。 */

export function stopTracks(stream) {
  if (!stream || typeof stream.getTracks !== "function") return;
  for (const track of stream.getTracks()) {
    if (track && typeof track.stop === "function") track.stop();
  }
}

export function stopCamera(video) {
  const stream = video?.srcObject ?? null;
  stopTracks(stream);
  if (video) video.srcObject = null;
  return true;
}
