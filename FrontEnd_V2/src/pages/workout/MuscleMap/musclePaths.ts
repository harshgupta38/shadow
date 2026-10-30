import type { MuscleId } from "@/api/types";

// Body diagram geometry. Both figures share one 200 x 420 canvas with the spine at x = 100.
// Every path below is the RIGHT half of the figure (x >= 100); the left half is the same
// path mirrored across the spine, so muscles are always symmetric.

export const VIEW_W = 200;
export const VIEW_H = 420;

export interface MuscleShape {
  muscle: MuscleId;
  d: string;
}

// Outline of the right half of the body, from the chin down the arm and leg and back up the inside.
export const SILHOUETTE =
  "M100 40 L107 42 L107 55 C118 58 132 62 144 66 C153 68 159 76 159 88 " +
  "C161 104 165 124 166 140 C169 160 173 184 177 204 C179 214 177 223 170 223 " +
  "C164 223 163 215 162 207 C158 189 154 167 150 149 C146 133 143 113 142 99 " +
  "C140 93 138 92 135 96 C138 122 134 152 132 178 C136 192 140 204 140 214 " +
  "C142 242 138 272 130 302 C128 330 128 366 124 396 C126 404 130 410 128 415 " +
  "L106 415 C106 404 106 396 107 388 C108 366 110 330 108 302 " +
  "C106 270 102 242 100 224 Z";

// Same outline left open at the spine, so stroking it doesn't draw a line down the middle of the body.
export const SILHOUETTE_OUTLINE = SILHOUETTE.replace(/ Z$/, "");

const shoulderCap =
  "M139 70 C150 68 158 77 157 91 C156 101 150 105 145 101 C140 94 138 82 139 70 Z";
const upperArm =
  "M146 102 C152 102 158 114 158 136 C154 143 147 143 145 135 C143 122 143 110 146 102 Z";
const forearm =
  "M150 148 C158 148 164 166 170 198 C166 204 160 202 157 194 C153 180 148 164 150 148 Z";

export const FRONT_SHAPES: MuscleShape[] = [
  { muscle: "traps", d: "M107 55 C118 58 130 62 141 68 C134 74 124 73 113 67 C109 63 107 59 107 55 Z" },
  { muscle: "chest", d: "M101 73 C112 69 128 71 138 81 C141 93 134 105 120 109 C110 110 102 103 101 93 Z" },
  { muscle: "shoulders", d: shoulderCap },
  { muscle: "biceps", d: upperArm },
  { muscle: "forearms", d: forearm },
  { muscle: "obliques", d: "M119 112 C127 114 132 136 131 170 C126 177 121 171 119 160 C118 142 118 126 119 112 Z" },
  { muscle: "abs", d: "M102.5 113 H114 Q116 113 116 115 V125 Q116 127 114 127 H102.5 Z" },
  { muscle: "abs", d: "M102.5 130 H114 Q116 130 116 132 V142 Q116 144 114 144 H102.5 Z" },
  { muscle: "abs", d: "M102.5 147 H114 Q116 147 116 149 V159 Q116 161 114 161 H102.5 Z" },
  { muscle: "abs", d: "M102.5 164 H113 Q115 164 115 166 V175 Q115 178 112 179 H102.5 Z" },
  { muscle: "quads", d: "M102 226 C118 220 136 228 138 252 C138 274 133 292 128 301 C118 301 108 297 106 287 C102 263 102 244 102 226 Z" },
  { muscle: "calves", d: "M108 313 C116 309 126 313 126 331 C126 353 124 377 121 394 C115 394 110 392 109 381 C107 359 107 335 108 313 Z" },
];

export const BACK_SHAPES: MuscleShape[] = [
  { muscle: "lats", d: "M140 92 C142 114 138 140 128 160 C122 170 112 174 104 174 C102 152 108 130 120 114 C128 106 134 98 140 92 Z" },
  { muscle: "lower_back", d: "M101 128 C110 130 118 142 118 170 C116 188 110 196 101 198 Z" },
  { muscle: "traps", d: "M101 50 C114 54 130 62 142 70 C136 88 118 104 101 118 Z" },
  { muscle: "shoulders", d: shoulderCap },
  { muscle: "triceps", d: upperArm },
  { muscle: "forearms", d: forearm },
  { muscle: "glutes", d: "M101 200 C120 194 140 206 139 228 C137 246 118 250 101 242 Z" },
  { muscle: "hamstrings", d: "M102 248 C120 244 138 252 138 276 C137 292 132 302 127 307 C116 307 106 301 104 289 C102 273 102 260 102 248 Z" },
  { muscle: "calves", d: "M108 315 C118 307 128 315 127 335 C126 355 123 377 120 395 C114 397 110 393 109 381 C106 359 106 335 108 315 Z" },
];

export const HEAD = { cx: 100, cy: 23, rx: 14, ry: 17 };
