// game-ghost.js v5 - Live2D 연동 (말풍선은 iframe 내부, 캐릭터는 부모 창 Live2D)
(function () {
  if (window.gameGhostUI) return;

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

  // 이벤트 타입 → game-emotion.js REACTIONS 키 직접 매핑
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

  let bubbleEl = null;
  let hideTimer = null;

  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function ensureDom() {
    if (bubbleEl) return;
    const d = document;
    const style = d.createElement("style");
    style.textContent = `
      .game-ghost-bubble {
        position: fixed;
        right: auto;
        left: auto;
        bottom: 0;
        padding: 7px 11px;
        border-radius: 14px 14px 4px 14px;
        background: rgba(255,255,255,0.97);
        box-shadow: 0 3px 12px rgba(0,0,0,0.22);
        font-size: 0.78rem;
        line-height: 1.42;
        text-align: left;
        color: #222;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.2s ease-out, transform 0.2s ease-out;
        pointer-events: none;
        z-index: 10002;
        box-sizing: border-box;
        word-break: keep-all;
        overflow-wrap: break-word;
        width: fit-content;
        width: -webkit-fit-content;
        max-width: var(--bubble-max-w, 260px);
      }
      .game-ghost-bubble::after {
        content: '';
        position: absolute;
        right: -8px;
        bottom: 10px;
        width: 14px;
        height: 14px;
        background: rgba(255,255,255,0.97);
        border-right: 1px solid rgba(0,0,0,0.08);
        border-bottom: 1px solid rgba(0,0,0,0.08);
        transform: rotate(45deg);
        box-shadow: 3px 3px 6px rgba(0,0,0,0.10);
      }
      .game-ghost-bubble.visible {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    d.head.appendChild(style);
    bubbleEl = d.createElement("div");
    bubbleEl.className = "game-ghost-bubble";
    d.body.appendChild(bubbleEl);
  }

  function calcBubblePos() {
    var isMob = window.innerWidth <= 768;
    var charW, charH, bubW, bubLeft, bubbleBottom;
    if (isMob) {
      charW = Math.min(140, Math.max(85,  Math.round(window.innerWidth  * 0.28)));
      charH = Math.min(220, Math.max(140, Math.round(window.innerHeight * 0.26)));
    } else {
      charW = Math.min(200, Math.max(120, Math.round(window.innerWidth  * 0.14)));
      charH = Math.min(300, Math.max(200, Math.round(window.innerHeight * 0.32)));
    }
    // 말풍선 너비 = 캐릭터 너비의 170% (캐릭터보다 조금 넓게, 잘림 없도록)
    bubW = Math.round(charW * 1.7);
    // 말풍선 오른쪽 끝 = 캐릭터 오른쪽에 맞춤, 텍스트 길이만큼만 너비 사용
    bubLeft = window.innerWidth - bubW - (isMob ? 6 : 10);
    bubbleBottom = Math.round(charH * 0.95) + "px";
    return {
      bottom:   bubbleBottom,
      left:     Math.max(4, bubLeft) + "px",
      right:    "auto",
      maxWidth: bubW + "px"
    };
  }

  function showBubble(text) {
    if (!bubbleEl) return;
    if (text) {
      bubbleEl.textContent = text;
      var pos = calcBubblePos();
      bubbleEl.style.bottom    = pos.bottom;
      bubbleEl.style.left      = pos.left;
      bubbleEl.style.right     = pos.right;
      bubbleEl.style.maxWidth  = pos.maxWidth;
      bubbleEl.style.width     = "fit-content";
      bubbleEl.classList.add("visible");
    } else {
      bubbleEl.textContent = "";
      bubbleEl.classList.remove("visible");
    }
  }

  function react(eventType) {
    ensureDom();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    const line = choice(LINES[eventType] || [""]);
    // 말풍선은 iframe 안에 표시 (캐릭터 바로 위)
    showBubble(line);

    // 부모 창 Live2D로 감정 전달 (game-emotion.js REACTIONS 키로 직접 매핑)
    var parentType = EMOTION_REMAP[eventType] || eventType;
    try {
      var target = (window.parent !== window) ? window.parent : (window.opener || null);
      if (target) target.postMessage({ type: "GAME_REACT", eventType: parentType }, "*");
    } catch(e) {}

    hideTimer = setTimeout(function() { showBubble(""); }, 5000);
  }

  window.gameGhostUI = { react: react };
  window.gameGhostReact = react;  // 편의 별칭

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureDom);
  } else {
    ensureDom();
  }
})();
