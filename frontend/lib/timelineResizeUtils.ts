export const PIXELS_PER_SECOND = 20;

export const SNAP_THRESHOLD_SECONDS =
  10 / PIXELS_PER_SECOND;

export const MINIMUM_CLIP_SECONDS = 0.5;

export type ResizeTrackItem = {
  id: string;
  startTime: number;
  duration: number;
  trackId: string;
};

export function findNearestSnapEdge(
  time: number,
  snapEdges: number[],
): number | null {
  let nearest: number | null = null;
  let shortestDistance =
    SNAP_THRESHOLD_SECONDS;

  for (const edge of snapEdges) {
    const distance = Math.abs(
      time - edge,
    );

    if (distance <= shortestDistance) {
      nearest = edge;
      shortestDistance = distance;
    }
  }

  return nearest;
}

type CalculateRightResizeOptions = {
  originalStart: number;
  originalEnd: number;
  movementSeconds: number;
  sourceStart: number;

  itemType: "media" | "text";

  mediaType?: string;
  sourceDuration?: number | null;

  trackItems: ResizeTrackItem[];
  snapEdges: number[];
};

export function calculateRightResize({
  originalStart,
  originalEnd,
  movementSeconds,
  sourceStart,
  itemType,
  mediaType,
  sourceDuration,
  trackItems,
  snapEdges,
}: CalculateRightResizeOptions) {
  let maximumEnd =
    Number.POSITIVE_INFINITY;

  if (itemType === "media") {
    maximumEnd =
      mediaType === "image"
        ? Number.POSITIVE_INFINITY
        : sourceDuration != null &&
            Number.isFinite(sourceDuration)
          ? originalStart +
            Math.max(
              0,
              sourceDuration -
                sourceStart,
            )
          : originalEnd;
  }

  let nextEnd = Math.min(
    maximumEnd,
    Math.max(
      originalStart +
        MINIMUM_CLIP_SECONDS,
      originalEnd +
        movementSeconds,
    ),
  );

  let guideTime: number | null =
    null;

  const snap = findNearestSnapEdge(
    nextEnd,
    snapEdges,
  );

  if (
    snap !== null &&
    snap >=
      originalStart +
        MINIMUM_CLIP_SECONDS &&
    snap <= maximumEnd
  ) {
    nextEnd = snap;
    guideTime = snap;
  }

  const shiftedStarts =
    new Map<string, number>();

  let occupiedUntil = nextEnd;

  for (const other of [...trackItems]
    .filter(
      (item) =>
        item.startTime >= originalStart,
    )
    .sort(
      (a, b) =>
        a.startTime - b.startTime,
    )) {
    const shiftedStart = Math.max(
      other.startTime,
      occupiedUntil,
    );

    shiftedStarts.set(
      other.id,
      shiftedStart,
    );

    occupiedUntil =
      shiftedStart +
      other.duration;
  }

  return {
    nextEnd,
    guideTime,
    shiftedStarts,
  };
}

type CalculateLeftResizeOptions = {
  originalStart: number;
  originalEnd: number;
  movementSeconds: number;
  sourceStart: number;

  itemType: "media" | "text";
  mediaType?: string;

  trackItems: ResizeTrackItem[];
  snapEdges: number[];
};

export function calculateLeftResize({
  originalStart,
  originalEnd,
  movementSeconds,
  sourceStart,
  itemType,
  mediaType,
  trackItems,
  snapEdges,
}: CalculateLeftResizeOptions) {
  let earliestSourceStart = 0;

  if (itemType === "media") {
    earliestSourceStart =
      mediaType === "image"
        ? 0
        : originalStart - sourceStart;
  }

  const previousClipEnd = trackItems
    .filter(
      (item) =>
        item.startTime + item.duration <=
        originalStart,
    )
    .reduce(
      (latest, item) =>
        Math.max(
          latest,
          item.startTime + item.duration,
        ),
      0,
    );

  const minimumStart = Math.max(
    0,
    earliestSourceStart,
    previousClipEnd,
  );

  const maximumStart =
    originalEnd -
    MINIMUM_CLIP_SECONDS;

  let nextStart = Math.max(
    minimumStart,
    Math.min(
      maximumStart,
      originalStart + movementSeconds,
    ),
  );

  let guideTime: number | null = null;

  const snap = findNearestSnapEdge(
    nextStart,
    snapEdges,
  );

  if (
    snap !== null &&
    snap >= minimumStart &&
    snap <= maximumStart
  ) {
    nextStart = snap;
    guideTime = snap;
  }

  return {
    nextStart,
    guideTime,
  };
}