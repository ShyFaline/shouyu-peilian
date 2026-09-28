import os
import subprocess

svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <!-- Background subtle gradient -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#F1F5F9"/>
    </linearGradient>

    <!-- Skin Base Gradient (Warm, Natural Caucasian/Asian skin tone) -->
    <linearGradient id="skinGrad" x1="0.3" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="#FDE8D7"/>
      <stop offset="60%" stop-color="#F5CBA7"/>
      <stop offset="100%" stop-color="#EDB892"/>
    </linearGradient>

    <!-- Finger Light Gradient -->
    <linearGradient id="fingerGrad" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#FEEDDC"/>
      <stop offset="50%" stop-color="#F7CFAE"/>
      <stop offset="100%" stop-color="#EBB38D"/>
    </linearGradient>

    <!-- Soft Shadow for thumb overlap -->
    <filter id="thumbShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="-3" dy="5" stdDeviation="4" flood-color="#803515" flood-opacity="0.28"/>
    </filter>

    <filter id="softGlow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#552211" flood-opacity="0.1"/>
    </filter>
  </defs>

  <!-- Card Background -->
  <rect x="24" y="24" width="752" height="752" rx="28" fill="url(#bgGrad)" stroke="#CBD5E1" stroke-width="2"/>

  <!-- Decorative subtle grid/accent line at top -->
  <path d="M 60 115 L 740 115" stroke="#E2E8F0" stroke-width="1.5" stroke-dasharray="4 4"/>

  <!-- Card Header / Metainfo -->
  <g id="header-meta">
    <!-- Big Letter Identification -->
    <text x="60" y="85" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="46" font-weight="800" fill="#1E293B">B</text>
    <text x="105" y="83" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="19" font-weight="600" fill="#64748B">/b/ · 汉语手指字母</text>
    <text x="60" y="106" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="13" fill="#94A3B8">依据 GF 0021—2019 标准条文原创插画 · 试制候选</text>

    <!-- View & Hand Specification Badge -->
    <g transform="translate(485, 52)">
      <rect x="0" y="0" width="255" height="42" rx="21" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1.5"/>
      <circle cx="21" cy="21" r="7" fill="#3B82F6"/>
      <text x="36" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="14" font-weight="700" fill="#1D4ED8">右手 · 掌心向前偏左 (正面观)</text>
    </g>
  </g>

  <!-- Illustration Group -->
  <g id="hand-illustration" transform="translate(0, 0)">
    
    <!-- WRIST & PALM BASE (Behind fingers and thumb) -->
    <!-- Wrist & Palm contour -->
    <path id="palm-base" d="
      M 285 745
      C 285 660, 275 600, 258 535
      C 246 485, 252 430, 268 395
      L 522 375
      C 542 410, 578 460, 582 510
      C 586 565, 555 635, 485 680
      C 475 705, 470 730, 468 745
      Z" 
      fill="url(#skinGrad)" 
      stroke="#2D1B14" 
      stroke-width="7" 
      stroke-linejoin="round"/>

    <!-- Thenar (大鱼际) Shadow/Shape at thumb base right side -->
    <path d="
      M 522 375 
      C 555 425, 585 475, 580 525 
      C 575 570, 545 625, 485 665 
      C 470 650, 460 620, 465 580 
      C 472 530, 500 450, 522 375 Z" 
      fill="#ECA882" 
      opacity="0.45"/>

    <!-- Hypothenar (小鱼际) Shadow/Shape left side -->
    <path d="
      M 285 745 
      C 285 660, 275 600, 258 535 
      C 250 495, 253 450, 265 410
      C 280 470, 295 550, 310 650
      C 305 700, 295 735, 285 745 Z" 
      fill="#ECA882" 
      opacity="0.3"/>

    <!-- FOUR FINGERS (Extended, firmly together) -->
    <!-- Finger 4: PINKY (小指, 左侧) -->
    <g id="finger-pinky">
      <!-- Pinky body -->
      <path d="
        M 268 395
        C 264 345, 262 285, 268 250
        C 272 225, 282 208, 296 208
        C 310 208, 318 225, 321 250
        C 324 285, 322 335, 324 378
        Z"
        fill="url(#fingerGrad)"
        stroke="#2D1B14"
        stroke-width="7"
        stroke-linejoin="round"/>
      <!-- Pinky inner side shade -->
      <path d="
        M 268 395
        C 264 345, 262 285, 268 250
        C 271 230, 278 215, 288 210
        C 280 220, 275 250, 276 300
        C 277 340, 278 370, 276 395 Z"
        fill="#DE9872"
        opacity="0.4"/>
      <!-- Pinky DIP crease -->
      <path d="M 272 265 C 282 263, 308 263, 317 265" stroke="#7A3E26" stroke-width="3" stroke-linecap="round" fill="none"/>
      <!-- Pinky PIP crease -->
      <path d="M 270 320 C 282 318, 310 318, 322 320" stroke="#7A3E26" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    </g>

    <!-- Finger 3: RING (无名指) -->
    <g id="finger-ring">
      <path d="
        M 324 378
        C 323 310, 323 230, 329 180
        C 334 152, 346 142, 360 142
        C 374 142, 384 152, 388 180
        C 392 230, 391 305, 392 364
        Z"
        fill="url(#fingerGrad)"
        stroke="#2D1B14"
        stroke-width="7"
        stroke-linejoin="round"/>
      <!-- Shadow between pinky and ring -->
      <path d="M 324 378 L 327 210 C 328 200, 332 195, 335 195 C 330 205, 329 270, 330 378 Z" fill="#DE9872" opacity="0.35"/>
      <!-- Ring DIP crease -->
      <path d="M 334 205 C 346 203, 372 203, 383 205" stroke="#7A3E26" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <!-- Ring PIP crease -->
      <path d="M 331 270 C 345 268, 374 268, 386 270" stroke="#7A3E26" stroke-width="4" stroke-linecap="round" fill="none"/>
    </g>

    <!-- Finger 2: MIDDLE (中指, 最长) -->
    <g id="finger-middle">
      <path d="
        M 392 364
        C 391 290, 391 200, 396 150
        C 400 120, 412 110, 428 110
        C 444 110, 455 120, 458 150
        C 463 200, 461 290, 461 366
        Z"
        fill="url(#fingerGrad)"
        stroke="#2D1B14"
        stroke-width="7"
        stroke-linejoin="round"/>
      <!-- Shadow between ring and middle -->
      <path d="M 392 364 L 394 170 C 395 160, 400 155, 403 155 C 398 165, 397 250, 397 364 Z" fill="#DE9872" opacity="0.35"/>
      <!-- Middle DIP crease -->
      <path d="M 402 180 C 416 178, 442 178, 453 180" stroke="#7A3E26" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <!-- Middle PIP crease -->
      <path d="M 398 250 C 414 248, 444 248, 457 250" stroke="#7A3E26" stroke-width="4" stroke-linecap="round" fill="none"/>
    </g>

    <!-- Finger 1: INDEX (食指, 右侧) -->
    <g id="finger-index">
      <path d="
        M 461 366
        C 461 295, 462 225, 467 175
        C 472 148, 483 138, 498 138
        C 513 138, 523 148, 526 175
        C 530 220, 528 300, 524 375
        Z"
        fill="url(#fingerGrad)"
        stroke="#2D1B14"
        stroke-width="7"
        stroke-linejoin="round"/>
      <!-- Index outer edge soft highlight -->
      <path d="
        M 522 175 
        C 525 210, 524 280, 520 360 
        C 517 320, 517 220, 513 175 Z" 
        fill="#FFEFE5" 
        opacity="0.6"/>
      <!-- Index DIP crease -->
      <path d="M 473 205 C 486 203, 512 203, 522 205" stroke="#7A3E26" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <!-- Index PIP crease -->
      <path d="M 468 275 C 482 273, 513 273, 524 275" stroke="#7A3E26" stroke-width="4" stroke-linecap="round" fill="none"/>
    </g>

    <!-- PALM DETAILS (Creases, Knuckles) -->
    <!-- Base knuckles shadow line (掌指关节下阴影) -->
    <path d="M 275 405 C 340 380, 440 375, 518 385" stroke="#7A3E26" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 6" opacity="0.4" fill="none"/>

    <!-- Gentle Palm Lines (自然掌纹) -->
    <path d="M 285 460 C 330 480, 385 470, 420 440" stroke="#88422A" stroke-width="3" stroke-linecap="round" opacity="0.4" fill="none"/>
    <path d="M 290 515 C 335 550, 390 560, 445 520" stroke="#88422A" stroke-width="3.5" stroke-linecap="round" opacity="0.35" fill="none"/>

    <!-- THUMB (CURLED ACROSS PALM, FOREGROUND) -->
    <!-- Thumb drop shadow cast on palm -->
    <path d="
      M 535 405
      C 505 405, 435 425, 375 440
      C 340 450, 320 470, 325 495
      C 332 525, 370 535, 415 530
      C 475 525, 525 510, 565 480
      Z"
      fill="#853518"
      opacity="0.3"
      filter="url(#thumbShadow)"/>

    <!-- Thumb main body (弯曲横跨掌心) -->
    <!-- The thumb originates from thenar (x~565, y~475), sweeps horizontally leftwards across index base, 
         knuckle flexes at x~450, tip rests in palm center at x~345 -->
    <g id="thumb-curled">
      <path d="
        M 565 475
        C 560 435, 545 405, 510 405
        C 465 405, 425 422, 380 436
        C 348 446, 330 465, 332 490
        C 334 515, 355 530, 385 530
        C 430 530, 475 518, 515 508
        C 545 500, 565 488, 565 475
        Z"
        fill="url(#skinGrad)"
        stroke="#2D1B14"
        stroke-width="7"
        stroke-linejoin="round"/>

      <!-- Thumb dorsal highlight (拇指背部微光，增强立体圆柱感) -->
      <path d="
        M 515 415
        C 475 415, 435 432, 395 445
        C 375 452, 355 465, 350 480
        C 355 470, 380 460, 415 448
        C 455 435, 495 425, 525 425
        Z"
        fill="#FFF2E8"
        opacity="0.55"/>

      <!-- Thumb IP knuckle flexion crease (拇指指间关节背侧折痕) -->
      <path d="M 435 420 C 438 445, 436 470, 432 495" stroke="#7A3E26" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <path d="M 445 425 C 448 445, 446 465, 442 485" stroke="#7A3E26" stroke-width="2.5" stroke-linecap="round" opacity="0.6" fill="none"/>

      <!-- Thumb Nail (拇指指甲，位于末端指背) -->
      <path d="
        M 345 472
        C 340 480, 340 495, 345 502
        C 352 510, 368 510, 375 502
        C 380 495, 380 480, 375 472
        C 368 465, 352 465, 345 472
        Z"
        fill="#FFEFE5"
        stroke="#8A4830"
        stroke-width="2.5"/>
      <!-- Nail highlight -->
      <path d="M 349 476 C 347 483, 348 493, 352 497" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none"/>
    </g>

    <!-- Wrist anatomical creases (手腕自然横纹) -->
    <path d="M 330 710 C 375 718, 415 716, 445 708" stroke="#7A3E26" stroke-width="3.5" stroke-linecap="round" opacity="0.45" fill="none"/>
    <path d="M 345 730 C 380 736, 410 735, 435 728" stroke="#7A3E26" stroke-width="2.5" stroke-linecap="round" opacity="0.3" fill="none"/>
  </g>

  <!-- Explanatory Educational Annotation Footer -->
  <g id="footer-notes" transform="translate(60, 725)">
    <circle cx="6" cy="6" r="4" fill="#059669"/>
    <text x="18" y="10" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="13" font-weight="600" fill="#334155">教学要点：四指伸直并拢直立；拇指自然弯曲横扣掌心；手心向前微偏左。</text>
  </g>
</svg>
"""

out_dir = r"工作副本/二维示范/practice/content/demos/illustration-candidates/B"
os.makedirs(out_dir, exist_ok=True)

svg_path = os.path.join(out_dir, "candidate-B.svg")
with open(svg_path, "w", encoding="utf-8") as f:
    f.write(svg_content)

print(f"Generated SVG: {svg_path}")
