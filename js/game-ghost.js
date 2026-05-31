// game-ghost.js v6 - 말풍선을 캐릭터 머리 바로 위에 정확히 배치
// 부모 창(Live2D ghostContainer)의 실제 getBoundingClientRect()를 postMessage로 수신해 위치 계산
(function () {
  if (window.gameGhostUI) return;

  // ─────────── 대사 정의 ───────────
  const LINES = {
    start: [
      "좋아, 한 번 제대로 놀아보자!",
      "준비 완료! 시작해 볼까?",
      "집중~ 이번 판은 꼭 해보자!",
      "파이팅! 내가 옆에서 지켜보고 있을게.",
      "천천히 해도 괜찮아. 우리 같이 해보자."
    ],
    correct: [
      "와, 정답이야! 완전 멋진데?",
      "맞췄다! 이런 감각이라면 금방 끝내겠는걸?",
      "굿! 지금 흐름 아주 좋아!",
      "정답! 방금 그 느낌 기억해 둬!",
      "오 훌륭해, 이번 판 에이스다!",
      "이 속도면 최고 기록도 노려보겠다!",
      "방금 그 선택, 완전 프로 감각인데?",
      "멋지다! 한 문제씩 확실히 쌓여 가고 있어.",
      "이렇게만 계속 가면 금방 마스터 하겠는걸?",
      "좋았어! 지금 리듬 그대로 이어가보자."
    ],
    miss: [
      "괜찮아, 한 번 더 해봐!",
      "어디가 헷갈렸는지 같이 봐볼까?",
      "실수도 연습의 일부야.",
      "다음엔 꼭 맞출 수 있어!"
    ],
    gameover: [
      "아쉽지만 다음에 더 잘할 수 있어.",
      "실패해도 괜찮아. 다시 하면 되지!",
      "이번 판은 여기까지! 한 번 더 도전해 볼까?",
      "에이, 이 정도면 워밍업이지 뭐.",
      "괜찮아. 나도 옆에서 다시 도와줄게."
    ],
    boss: [
      "보스 등장! 긴장 늦추지 마!",
      "오, 강적이 왔어! 잘 피하면서 싸워!",
      "보스야! 패턴 잘 보고 공격해!",
      "이런, 보스 등장! 집중해!",
      "보스가 나타났어. 침착하게 대응해!"
    ],
    levelup: [
      "레벨업! 점점 강해지고 있어! 😊",
      "레벨 올랐다! 스킬 잘 골라봐!",
      "성장했네! 어떤 능력을 키울 거야?",
      "와, 레벨업! 계속 이렇게 해줘!",
      "레벨업 축하해! 더 강해질 수 있어!"
    ],
    bossClear: [
      "보스 처치! 대단한데?!",
      "와, 해냈어! 보스를 무찔렀어!",
      "보스 격파! 역시 믿었다고!",
      "보스 처치! 정말 잘했어!",
      "완벽해! 다음 보스도 이길 수 있어!"
    ],
    reward: [
      "보상을 골라봐! 신중하게!",
      "어떤 걸 선택할 거야? 기대되는데!",
      "보상 시간! 뭐가 제일 좋을까~?",
      "이것도 좋고 저것도 좋은데… 잘 골라봐!",
      "보상 선택! 전략적으로 생각해봐!"
    ]
  };

  // 이벤트 타입 → game-emotion.js REACTIONS 키 매핑
  const EMOTION_REMAP = {
    start:     "start",
    correct:   "good",
    miss:      "miss",
    gameover:  "gameover",
    exit:      "exit",
    boss:      "start",
    levelup:   "good",
    bossClear: "good",
    reward:    "good"
  };

  let bubbleEl  = null;
  let hideTimer = null;

  // 부모 창에서 받아온 ghostContainer 위치 캐시
  // { left, top, right, bottom, width, height } (뷰포트 기준 px)
  let cachedGhostRect = null;
  let rectRequested   = false;

  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ─────────── DOM 생성 ───────────
  function ensureDom() {
    if (bubbleEl) return;
    var d = document;
    var style = d.createElement("style");
    style.textContent = [
      /* 말풍선 본체 */
      ".game-ghost-bubble {",
      "  position: fixed;",
      "  padding: 8px 13px;",
      "  border-radius: 16px 16px 16px 4px;",   /* 왼쪽 아래가 뾰족 → 말꼬리가 오른쪽 아래에 */
      "  background: rgba(255,255,255,0.97);",
      "  box-shadow: 0 4px 14px rgba(0,0,0,0.22);",
      "  font-size: 0.80rem;",
      "  line-height: 1.45;",
      "  text-align: left;",
      "  color: #1e293b;",
      "  opacity: 0;",
      "  transform: translateY(6px);",
      "  transition: opacity 0.22s ease-out, transform 0.22s ease-out;",
      "  pointer-events: none;",
      "  z-index: 10002;",
      "  box-sizing: border-box;",
      "  word-break: keep-all;",
      "  overflow-wrap: break-word;",
      "  width: fit-content;",
      "  width: -webkit-fit-content;",
      "  max-width: var(--bubble-max-w, 240px);",
      "}",
      /* 말꼬리: 말풍선 오른쪽 아래 → 캐릭터(오른쪽 방향) 쪽 */
      ".game-ghost-bubble::after {",
      "  content: '';",
      "  position: absolute;",
      "  right: 14px;",             /* 말풍선 오른쪽에서 14px 안쪽 */
      "  bottom: -8px;",            /* 말풍선 아래로 삐져나옴 */
      "  width: 14px;",
      "  height: 14px;",
      "  background: rgba(255,255,255,0.97);",
      "  border-right: 1px solid rgba(0,0,0,0.07);",
      "  border-bottom: 1px solid rgba(0,0,0,0.07);",
      "  transform: rotate(45deg);",
      "  box-shadow: 3px 3px 5px rgba(0,0,0,0.09);",
      "}",
      ".game-ghost-bubble.visible {",
      "  opacity: 1;",
      "  transform: translateY(0);",
      "}"
    ].join("\n");
    d.head.appendChild(style);

    bubbleEl = d.createElement("div");
    bubbleEl.className = "game-ghost-bubble";
    d.body.appendChild(bubbleEl);
  }

  // ─────────── 부모 창에 ghostContainer 위치 요청 ───────────
  function requestGhostRect() {
    if (rectRequested) return;
    rectRequested = true;
    try {
      var target = (window.parent !== window) ? window.parent : (window.opener || null);
      if (target) target.postMessage({ type: "GAME_GHOST_RECT_REQ" }, "*");
    } catch (e) {}
    // 200ms 후 자동 해제 → 다음 react() 호출 시 재요청 가능
    setTimeout(function () { rectRequested = false; }, 200);
  }

  // 부모 창 응답 수신
  window.addEventListener("message", function (ev) {
    if (!ev.data || ev.data.type !== "GAME_GHOST_RECT_RES") return;
    cachedGhostRect = ev.data.rect; // { left, top, right, bottom, width, height }
  });

  // ─────────── 말풍선 위치 계산 ───────────
  // ghostContainer rect(부모 뷰포트 기준)를 기반으로
  // 캐릭터 머리 바로 위 + 왼쪽 정렬
  function calcBubblePos() {
    var isMob  = window.innerWidth <= 768;
    var maxBubW = isMob ? 200 : 240;
    var gap     = 10; // 말풍선 아래 끝 ~ 캐릭터 머리 사이 간격(px)

    if (cachedGhostRect) {
      var rect = cachedGhostRect;

      // 캐릭터 머리 높이 추정: ghostContainer 상단에서 약 15% 지점
      // (Live2D 모델은 컨테이너 꼭대기가 아닌 약간 아래에서 시작)
      var headY  = rect.top + rect.height * 0.15;
      // 말풍선 하단 = 머리 위 gap px
      var bubBottom  = window.innerHeight - headY + gap;

      // 말풍선 왼쪽: 캐릭터 왼쪽에서 시작, 단 화면 밖으로 나가지 않도록 클램프
      var bubLeft = Math.max(6, Math.min(rect.left, window.innerWidth - maxBubW - 6));

      return {
        bottom:   Math.max(4, Math.round(bubBottom)) + "px",
        left:     Math.round(bubLeft) + "px",
        right:    "auto",
        maxWidth: maxBubW + "px"
      };
    }

    // rect 미수신 시 폴백: 화면 크기 기반 추정
    var charW = isMob
      ? Math.min(140, Math.max(85,  Math.round(window.innerWidth  * 0.28)))
      : Math.min(200, Math.max(120, Math.round(window.innerWidth  * 0.14)));
    var charH = isMob
      ? Math.min(220, Math.max(140, Math.round(window.innerHeight * 0.26)))
      : Math.min(300, Math.max(200, Math.round(window.innerHeight * 0.32)));

    var bubW    = Math.round(charW * 1.7);
    var bubLeft = window.innerWidth - bubW - (isMob ? 6 : 10);
    // 캐릭터 머리(상단 20% 지점) 바로 위
    var headBottom = charH * 0.82;

    return {
      bottom:   Math.round(headBottom) + "px",
      left:     Math.max(4, bubLeft) + "px",
      right:    "auto",
      maxWidth: bubW + "px"
    };
  }

  // ─────────── 말풍선 표시/숨김 ───────────
  function showBubble(text) {
    if (!bubbleEl) return;
    if (text) {
      bubbleEl.textContent = text;
      var pos = calcBubblePos();
      bubbleEl.style.bottom   = pos.bottom;
      bubbleEl.style.left     = pos.left;
      bubbleEl.style.right    = pos.right;
      bubbleEl.style.setProperty("--bubble-max-w", pos.maxWidth);
      bubbleEl.style.maxWidth = pos.maxWidth;
      bubbleEl.style.width    = "fit-content";
      bubbleEl.classList.add("visible");
    } else {
      bubbleEl.textContent = "";
      bubbleEl.classList.remove("visible");
    }
  }

  // ─────────── react: 게임 이벤트 처리 ───────────
  function react(eventType) {
    ensureDom();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    // 부모 창에 캐릭터 위치 요청 (비동기 — 이미 캐시된 값 있으면 즉시 사용)
    requestGhostRect();

    var line = choice(LINES[eventType] || [""]);

    // rect 수신 약간 기다렸다가 표시 (최대 80ms, rect 없으면 폴백으로 즉시 표시)
    var shown = false;
    function doShow() {
      if (shown) return;
      shown = true;
      showBubble(line);
    }

    if (cachedGhostRect) {
      doShow();
    } else {
      setTimeout(doShow, 80);
    }

    // 부모 창 Live2D 감정 전달
    var parentType = EMOTION_REMAP[eventType] || eventType;
    try {
      var target = (window.parent !== window) ? window.parent : (window.opener || null);
      if (target) target.postMessage({ type: "GAME_REACT", eventType: parentType }, "*");
    } catch (e) {}

    hideTimer = setTimeout(function () { showBubble(""); }, 5000);
  }

  // ─────────── 공개 API ───────────
  window.gameGhostUI  = { react: react };
  window.gameGhostReact = react; // 편의 별칭

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureDom);
  } else {
    ensureDom();
  }
})();
