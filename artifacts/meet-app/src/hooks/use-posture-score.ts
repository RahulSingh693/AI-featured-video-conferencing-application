import { useEffect, useRef, useState, useCallback } from "react";
import {
  PoseLandmarker,
  FaceLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// ── MediaPipe model URLs (loaded from Google CDN, no bundling needed) ────────
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

// ── Landmark indices ──────────────────────────────────────────────────────────
const L_SHOULDER = 11, R_SHOULDER = 12, L_EAR_POSE = 7;
const LEFT_EYE  = [33,  160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const F_NOSE = 1, F_CHIN = 152, F_LEFT = 234, F_RIGHT = 454, F_FORE = 10;

const EAR_THRESH   = 0.20;
const YAW_THRESH   = 0.30;
const PITCH_THRESH = 0.35;
const CAL_FRAMES   = 40;   // frames to collect before scoring starts
const SCORE_INTERVAL_MS = 2000; // run inference every 2 s

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PostureScoreResult {
  /** Combined 0-100 score (50 posture + 50 attention). null while calibrating. */
  score: number | null;
  postureScore: number;      // 0-50
  attentionScore: number;    // 0-50
  suggestions: string[];
  isCalibrating: boolean;
  calibrationProgress: number; // 0-1
}

interface UsePostureScoreOptions {
  /** Ref to the local <video> element (the same ref passed to ParticipantTile). */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Pause processing when the camera is off. */
  enabled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function vec2(lm: { x: number; y: number }, w: number, h: number) {
  return [lm.x * w, lm.y * h] as [number, number];
}

function angle(a: [number, number], b: [number, number], c: [number, number]) {
  const r =
    Math.atan2(c[1] - b[1], c[0] - b[0]) -
    Math.atan2(a[1] - b[1], a[0] - b[0]);
  const deg = Math.abs((r * 180) / Math.PI);
  return deg > 180 ? 360 - deg : deg;
}

function eyeAR(
  lms: { x: number; y: number }[],
  idx: number[],
  w: number,
  h: number,
) {
  const p = idx.map((i) => vec2(lms[i], w, h));
  const v1 = Math.hypot(p[1][0] - p[5][0], p[1][1] - p[5][1]);
  const v2 = Math.hypot(p[2][0] - p[4][0], p[2][1] - p[4][1]);
  const hz = Math.hypot(p[0][0] - p[3][0], p[0][1] - p[3][1]) + 1e-6;
  return (v1 + v2) / (2 * hz);
}

function headPose(
  lms: { x: number; y: number }[],
  w: number,
  h: number,
): [number, number] {
  const nose  = vec2(lms[F_NOSE],  w, h);
  const left  = vec2(lms[F_LEFT],  w, h);
  const right = vec2(lms[F_RIGHT], w, h);
  const chin  = vec2(lms[F_CHIN],  w, h);
  const fore  = vec2(lms[F_FORE],  w, h);
  const fw = Math.hypot(right[0] - left[0], right[1] - left[1]) + 1e-6;
  const fh = Math.hypot(chin[0]  - fore[0], chin[1]  - fore[1]) + 1e-6;
  const yaw   = Math.max(-1, Math.min(1, ((nose[0] - left[0]) / fw - 0.5) * 2));
  const pitch = Math.max(-1, Math.min(1, ((nose[1] - fore[1]) / fh - 0.45) * 2));
  return [yaw, pitch];
}

function computeScore(
  shAng: number, nkAng: number,
  shCal: number, nkCal: number,
  avgEar: number,
  yaw: number, pitch: number,
): Omit<PostureScoreResult, "isCalibrating" | "calibrationProgress"> {
  const tips: string[] = [];

  // Posture (50 pts)
  const shPts = Math.max(0, 25 - Math.max(0, shCal - shAng) * 1.5);
  const nkPts = Math.max(0, 25 - Math.max(0, nkCal - nkAng) * 1.5);
  const posture = shPts + nkPts;
  if (shCal - shAng > 5) tips.push("Straighten your shoulders");
  if (nkCal - nkAng > 5) tips.push("Reduce forward head tilt");

  // Attention (50 pts)
  const eyePts  = avgEar >= EAR_THRESH ? 20 : Math.max(0, 20 * (avgEar / EAR_THRESH));
  const yawPts  = 15 * Math.max(0, 1 - Math.abs(yaw)   / YAW_THRESH);
  const pitchPts = 15 * Math.max(0, 1 - Math.abs(pitch) / PITCH_THRESH);
  const attention = eyePts + yawPts + pitchPts;

  if (avgEar < EAR_THRESH)     tips.push("Open your eyes / stay alert");
  if (Math.abs(yaw) > YAW_THRESH) tips.push("Look back at the screen");
  if (pitch > PITCH_THRESH)    tips.push("Raise your gaze slightly");
  else if (pitch < -PITCH_THRESH) tips.push("Lower gaze to screen level");

  return {
    score: Math.round(posture + attention),
    postureScore:  Math.round(posture),
    attentionScore: Math.round(attention),
    suggestions: tips,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePostureScore({
  videoRef,
  enabled,
}: UsePostureScoreOptions): PostureScoreResult {
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calibration state (held in refs to avoid stale closures inside setInterval)
  const calShRef   = useRef<number[]>([]);
  const calNkRef   = useRef<number[]>([]);
  const calDoneRef = useRef(0);
  const shCalRef   = useRef(0);
  const nkCalRef   = useRef(0);
  const calibratedRef = useRef(false);

  const [result, setResult] = useState<PostureScoreResult>({
    score: null,
    postureScore: 0,
    attentionScore: 0,
    suggestions: [],
    isCalibrating: true,
    calibrationProgress: 0,
  });

  // ── Load models (once) ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const [pose, face] = await Promise.all([
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
          runningMode: "IMAGE",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
        }),
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
          runningMode: "IMAGE",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
        }),
      ]);
      if (!cancelled) {
        poseLandmarkerRef.current = pose;
        faceLandmarkerRef.current = face;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Inference loop ────────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const video = videoRef.current;
    const pose  = poseLandmarkerRef.current;
    const face  = faceLandmarkerRef.current;
    if (!video || !pose || !face || video.readyState < 2) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return;

    // Draw to offscreen canvas so MediaPipe can read pixel data
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);

    let poseResult: PoseLandmarkerResult;
    let faceResult: FaceLandmarkerResult;
    try {
      poseResult = pose.detect(canvas);
      faceResult = face.detect(canvas);
    } catch {
      return;
    }

    // Defaults when detectors fail
    let shAng = 0, nkAng = 0;
    let avgEar = 0.25, yaw = 0, pitch = 0;

    if (poseResult.landmarks.length > 0) {
      const lms = poseResult.landmarks[0];
      const ls  = vec2(lms[L_SHOULDER],  w, h);
      const rs  = vec2(lms[R_SHOULDER],  w, h);
      const le  = vec2(lms[L_EAR_POSE],  w, h);
      shAng = angle(ls, rs, [rs[0], 0]);
      nkAng = angle(le, ls, [ls[0], 0]);
    }

    if (faceResult.faceLandmarks.length > 0) {
      const flms = faceResult.faceLandmarks[0];
      avgEar = (eyeAR(flms, LEFT_EYE, w, h) + eyeAR(flms, RIGHT_EYE, w, h)) / 2;
      [yaw, pitch] = headPose(flms, w, h);
    }

    // Calibration
    if (!calibratedRef.current) {
      if (poseResult.landmarks.length > 0 && calDoneRef.current < CAL_FRAMES) {
        calShRef.current.push(shAng);
        calNkRef.current.push(nkAng);
        calDoneRef.current += 1;
      }
      if (calDoneRef.current >= CAL_FRAMES) {
        shCalRef.current = calShRef.current.reduce((a, b) => a + b, 0) / CAL_FRAMES;
        nkCalRef.current = calNkRef.current.reduce((a, b) => a + b, 0) / CAL_FRAMES;
        calibratedRef.current = true;
      }
      setResult((prev) => ({
        ...prev,
        isCalibrating: true,
        calibrationProgress: calDoneRef.current / CAL_FRAMES,
      }));
      return;
    }

    const scores = computeScore(
      shAng, nkAng,
      shCalRef.current, nkCalRef.current,
      avgEar, yaw, pitch,
    );
    setResult({ ...scores, isCalibrating: false, calibrationProgress: 1 });
  }, [videoRef]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(runFrame, SCORE_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [enabled, runFrame]);

  return result;
}