import { notFound } from "next/navigation";
import PlaybackFixture from "./PlaybackFixture";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PlaybackFixture />;
}
