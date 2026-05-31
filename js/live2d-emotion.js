/**
 * live2d-emotion.js  v17.2  (야옹이/히지키 모델)
 *
 * v17.0 → v17.1 수정사항:
 *  [Fix] 립싱크: CubismModel.prototype.update 패치 → beforeModelUpdate 이벤트 방식으로 교체
 *        (모션 업데이트 직후 파라미터 주입 → 덮어쓰기 없음, 확실히 동작)
 *  [Fix] 패럴랙스 소실: transform:none !important 제거 → ghostContainer에 --plx-x/y 정상 작동
 *  [Fix] 모바일 캐릭터: PC처럼 크게 (화면 너비 기준 스케일, y 위치 올림)
 *  [Fix] PC 캐릭터: y 위치 40px 추가 상향
 *  [Add] Live2DModel.focus()로 마우스/자이로 눈동자 추적 연동
 */
(function () {
  "use strict";

  /* ──────────────────────────────────────
     1.  감정 → 모션 + 표정 매핑
  ────────────────────────────────────── */
  /* hijiki 모션: 00_idle(대기), 01(FlickUp/반응), 02(FlickDown/내려감),
     03(Tap/터치), 04(Idle2/대기2), 05(Flick/흔들림), 06(Tap2), 07(Tap3), 08(Idle3)
     expression 없음 → expr 필드 제거 */
  var EMOTION_CONFIG = {
    "기본대기":  { motion:"Idle",      lipsync:{ speed:0.28, amp:0.60 } },
    "졸림":      { motion:"Idle",      lipsync:{ speed:0.10, amp:0.25 } },
    "지침":      { motion:"Idle",      lipsync:{ speed:0.12, amp:0.28 } },
    "인사":      { motion:"FlickUp",   lipsync:{ speed:0.30, amp:0.75 } },
    "공손한인사":{ motion:"FlickUp",   lipsync:{ speed:0.26, amp:0.60 } },
    "분노":      { motion:"Tap",       lipsync:{ speed:0.35, amp:0.85 } },
    "신남":      { motion:"Tap",       lipsync:{ speed:0.38, amp:0.90 } },
    "기쁨":      { motion:"FlickUp",   lipsync:{ speed:0.32, amp:0.80 } },
    "만세":      { motion:"FlickUp",   lipsync:{ speed:0.38, amp:0.90 } },
    "실망":      { motion:"FlickDown", lipsync:{ speed:0.15, amp:0.40 } },
    "슬픔":      { motion:"FlickDown", lipsync:{ speed:0.13, amp:0.35 } },
    "부끄러움":  { motion:"Flick",     lipsync:{ speed:0.20, amp:0.50 } },
    "경청":      { motion:"Idle",      lipsync:{ speed:0.22, amp:0.55 } },
    "벌서기":    { motion:"Tap",       lipsync:{ speed:0.18, amp:0.45 } },
    "터치막기":  { motion:"Tap",       lipsync:{ speed:0.35, amp:0.85 } },
    "절망":      { motion:"FlickDown", lipsync:{ speed:0.10, amp:0.20 } },
    "위로":      { motion:"Idle",      lipsync:{ speed:0.22, amp:0.55 } },
    "뒤돌기":    { motion:"FlickDown", lipsync:{ speed:0.18, amp:0.40 } },
    "화면보기":  { motion:"Idle",      lipsync:{ speed:0.20, amp:0.50 } },
    "생각중":    { motion:"Idle",      lipsync:{ speed:0.20, amp:0.45 } },
    // dialog.js에서 사용하는 감정
    "기대":      { motion:"FlickUp",   lipsync:{ speed:0.30, amp:0.70 } },
    "장난":      { motion:"Tap",       lipsync:{ speed:0.35, amp:0.80 } },
  };

  /* ujuu(우주) 모델(접수원)용 감정 매핑
     tachie03: 모션 없는 스태틱 모델, 립싱크 파라미터: ParamMouthOpenY */
  var GREETER_EMOTION_CONFIG = {
    "기본대기":  { lipsync:{ speed:0.25, amp:0.55 } },
    "졸림":      { lipsync:{ speed:0.10, amp:0.25 } },
    "지침":      { lipsync:{ speed:0.12, amp:0.28 } },
    "인사":      { lipsync:{ speed:0.30, amp:0.75 } },
    "공손한인사":{ lipsync:{ speed:0.28, amp:0.65 } },
    "분노":      { lipsync:{ speed:0.35, amp:0.85 } },
    "신남":      { lipsync:{ speed:0.38, amp:0.90 } },
    "기쁨":      { lipsync:{ speed:0.32, amp:0.80 } },
    "만세":      { lipsync:{ speed:0.38, amp:0.90 } },
    "실망":      { lipsync:{ speed:0.15, amp:0.40 } },
    "슬픔":      { lipsync:{ speed:0.13, amp:0.35 } },
    "부끄러움":  { lipsync:{ speed:0.20, amp:0.50 } },
    "경청":      { lipsync:{ speed:0.22, amp:0.55 } },
    "벌서기":    { lipsync:{ speed:0.18, amp:0.45 } },
    "터치막기":  { lipsync:{ speed:0.35, amp:0.85 } },
    "절망":      { lipsync:{ speed:0.10, amp:0.20 } },
    "위로":      { lipsync:{ speed:0.22, amp:0.55 } },
    "뒤돌기":    { lipsync:{ speed:0.18, amp:0.40 } },
    "화면보기":  { lipsync:{ speed:0.20, amp:0.50 } },
    "생각중":    { lipsync:{ speed:0.20, amp:0.45 } },
    "기대":      { lipsync:{ speed:0.30, amp:0.70 } },
    "장난":      { lipsync:{ speed:0.35, amp:0.80 } },
  };

  /* ──────────────────────────────────────
     2.  상태 변수
  ────────────────────────────────────── */
  var lipsyncTarg  = 0;
  var lipsyncCur   = 0;
  var lipsyncTimer = null;
  var currentModelKey = "hijiki";  // "hijiki" | "greeter"
  var app = null;                  // PIXI Application (재사용)
  var currentLipsync = { speed: 0.28, amp: 0.60 };
  var blobUrls  = {};
  var model     = null;
  var ready     = false;
  var pending   = null;
  var currentExpr = null;

  /* ──────────────────────────────────────
     3.  에셋 Blob 생성
  ────────────────────────────────────── */
  function buildBlobsFrom(assets) {
    var urls = {};
    Object.keys(assets).forEach(function (k) {
      var a = assets[k];
      // blob: URL 대신 data: URL 사용 (HTTPS 환경에서 blob: URL은 XHR/fetch 불가)
      if (a.type === "binary" || a.type === "image/png") {
        var mime = a.type === "image/png" ? "image/png" : "application/octet-stream";
        urls[k] = "data:" + mime + ";base64," + a.data;
      } else {
        var b64 = btoa(unescape(encodeURIComponent(a.data)));
        urls[k] = "data:application/json;base64," + b64;
      }
    });
    return urls;
  }

  function buildBlobs(modelKey) {
    var assets = (modelKey === "greeter") ? window.UJUU_ASSETS : window.HIJIKI_ASSETS;
    var label  = (modelKey === "greeter") ? "UJUU_ASSETS" : "HIJIKI_ASSETS";
    if (!assets) {
      console.error("[Live2D] " + label + " 없음");
      return false;
    }
    blobUrls = buildBlobsFrom(assets);
    return true;
  }

  /* ──────────────────────────────────────
     4.  model3.json → Blob URL 치환
  ────────────────────────────────────── */
  var MODEL_META = {
    hijiki:  { modelJson: "hijiki.model3.json",        moc: "hijiki.moc3",        physics: "hijiki.physics3.json",        pose: "hijiki.pose3.json" },
    greeter: { modelJson: "tachie03.model3.json",         moc: "tachie03.moc3",         physics: "tachie03.physics3.json",         pose: null },
  };

  function buildModelUrl(modelKey) {
    var meta = MODEL_META[modelKey] || MODEL_META.hijiki;
    var assets = (modelKey === "greeter") ? window.UJUU_ASSETS : window.HIJIKI_ASSETS;
    var o = JSON.parse(assets[meta.modelJson].data);
    o.FileReferences.Moc = blobUrls[meta.moc];
    o.FileReferences.Textures = o.FileReferences.Textures.map(function (t) {
      return blobUrls[t] || t;
    });
    if (o.FileReferences.Physics) o.FileReferences.Physics = blobUrls[meta.physics];
    if (o.FileReferences.Pose && meta.pose && blobUrls[meta.pose])    o.FileReferences.Pose    = blobUrls[meta.pose];
    if (o.FileReferences.Motions) {
      Object.keys(o.FileReferences.Motions).forEach(function (g) {
        o.FileReferences.Motions[g] = o.FileReferences.Motions[g].map(function (m) {
          return { File: blobUrls[m.File] || m.File };
        });
      });
    }
    if (o.FileReferences.Expressions) {
      o.FileReferences.Expressions = o.FileReferences.Expressions.map(function (e) {
        return { Name: e.Name, File: blobUrls[e.File] || e.File };
      });
    }
    var json = JSON.stringify(o);
    var b64 = btoa(unescape(encodeURIComponent(json)));
    return "data:application/json;base64," + b64;
  }

  /* ──────────────────────────────────────
     5.  립싱크 — beforeModelUpdate 이벤트 방식
        ※ 모션이 A.saveParameters() → A.loadParameters() 로 값 복원하기 전에
           파라미터를 추가로 주입. 덮어쓰기 없이 누산(add)되므로 안전.
  ────────────────────────────────────── */
  /* ──────────────────────────────────────
     5-b.  _startMotion 패치 — 투명 플리커 제거
           기본 동작: stopAllMotions() → startMotion()
           → stopAllMotions 직후 한 프레임 모션 없음 → 파라미터 0 → 깜빡임
           패치: stopAllMotions 제거 → QueueManager가 기존 모션 FadeOut하면서
                새 모션 FadeIn → 자연스러운 크로스페이드
  ────────────────────────────────────── */
  function patchMotionTransition(m) {
    try {
      var mgr = m.internalModel.motionManager;
      if (!mgr || mgr.__transitionPatched) return;
      var _orig = mgr._startMotion.bind(mgr);
      mgr._startMotion = function(motion, onFinish) {
        // stopAllMotions() 호출 없이 새 모션만 시작
        // → QueueManager.startMotion이 기존 모션에 FadeOut 설정 후 새 모션 추가
        motion.setFinishedMotionHandler(onFinish);
        return mgr.queueManager.startMotion(motion, false, performance.now());
      };
      mgr.__transitionPatched = true;
      console.log("[Live2D] 모션 전환 패치 완료 (크로스페이드)");
    } catch(e) {
      console.warn("[Live2D] 모션 전환 패치 실패:", e);
    }
  }

  function hookLipsync(m, modelKey) {
    // 모델별 립싱크 파라미터 이름
    var lipParam = (modelKey === "greeter") ? "ParamMouthOpenY" : "PARAM_MOUTH_OPEN_Y";
    var internalModel = m.internalModel;
    internalModel.on("beforeModelUpdate", function () {
      lipsyncCur += (lipsyncTarg - lipsyncCur) * currentLipsync.speed;
      if (lipsyncCur < 0.001) return;
      try {
        internalModel.coreModel.addParameterValueById(
          lipParam,
          lipsyncCur * currentLipsync.amp
        );
      } catch (_) {}
    });
    console.log("[Live2D] 립싱크 훅 완료 (" + lipParam + ")");
  }

  /* ──────────────────────────────────────
     6.  마우스/자이로 → Live2DModel.focus() 연동
        parallax-3d.js 가 CSS 변수로 ghostContainer를 움직이는 것과 별개로,
        Live2D 내부 눈동자(EyeBall)·앵글도 마우스에 반응하도록 연결.
  ────────────────────────────────────── */
  function hookFocus(m) {
    var isMob = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                (navigator.maxTouchPoints > 1 && window.innerWidth < 900);

    if (!isMob) {
      /* PC: mousemove → 우주(greeter) 시선 추적만 */
      document.addEventListener("mousemove", function (e) {
        if (!model || currentModelKey !== "greeter") return;
        var nx = (e.clientX / window.innerWidth)  * 2 - 1;
        var ny = (e.clientY / window.innerHeight) * 2 - 1;
        try { model.focus(e.clientX, e.clientY); } catch(_) {}
        try {
          var fc = model.internalModel.focusController;
          if (fc && typeof fc.focus === "function") fc.focus(nx, -ny);
        } catch (_) {}
      }, { passive: true });
    } else {
      /* 모바일: deviceorientation → focus */
      function applyGyro(e) {
        if (e.gamma === null && e.beta === null) return;
        var nx = Math.max(-1, Math.min(1, (e.gamma || 0) / 30));
        var ny = Math.max(-1, Math.min(1, ((e.beta  || 0) - 15) / 40));  // 상하 범위 절반
        try {
          model.internalModel.focusController.focus(nx, -ny);
        } catch (_) {}
      }

      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        document.addEventListener("touchstart", function h() {
          document.removeEventListener("touchstart", h);
          DeviceOrientationEvent.requestPermission()
            .then(function (s) {
              if (s === "granted")
                window.addEventListener("deviceorientation", applyGyro, { passive: true });
            }).catch(function () {});
        }, { once: true, passive: true });
      } else {
        window.addEventListener("deviceorientation", applyGyro, { passive: true });
      }
    }
    console.log("[Live2D] focus 훅 완료 (" + (isMob ? "자이로" : "마우스") + ")");
  }

  /* ──────────────────────────────────────
     7.  컨테이너 크기 계산
  ────────────────────────────────────── */
  /* ──────────────────────────────────────
     6.  컨테이너 크기
  ────────────────────────────────────── */
  function getContainerSize() {
    var mob = window.innerWidth <= 768;
    if (mob) {
      // 모바일: ghostContainer = 75vw, right:0 (PC와 동일 구조)
      // chatDock 실제 높이 측정으로 가시영역 계산
      var chatDock = document.getElementById("chatDock");
      var chatH = chatDock ? chatDock.getBoundingClientRect().height : 160;
      return {
        w:        Math.round(window.innerWidth * 0.75),
        h:        window.innerHeight,
        chatH:    chatH,
        isMobile: true
      };
    }
    return { w: 660, h: 660, chatH: 0, isMobile: false };
  }

  /* ──────────────────────────────────────
     7.  스케일·위치 계산
         - 두 모델 완전히 동일한 공식 → 교체 시 위치 변화 없음
         - PC:     컨테이너(660×660) 기준, 캐릭터 높이 115% (발 잘림)
         - 모바일: 채팅창 제외 가시영역 기준, 캐릭터 90%로 맞춤
                  posY를 양수로 → 머리가 화면 안에 들어옴
  ────────────────────────────────────── */
  function calcTransform(mW, mH, sz, modelKey) {
    // mW/mH = internalModel.width/height (실제 렌더 기준 크기)
    var sc, posX, posY;
    var isGreeter = (modelKey === "greeter");

    if (sz.isMobile) {
      var chatH = sz.chatH || 160;
      var visH  = sz.h - chatH;
      sc   = (visH * 0.90) / mH;
      posX = (sz.w - mW * sc) / 2;
      posY = (sz.h - chatH - 10) - (mH * sc);
      posY += 95;  // 기본 +80 + 15px 추가
      // 우주 모바일: 44% 확대 - 260px (320px 위로)
      if (isGreeter) {
        sc   *= 1.44;
        posX  = (sz.w - mW * sc) / 2;
        posY += -260;
      }
    } else {
      sc   = (sz.h * 1.15) / mH;
      posX = (sz.w - mW * sc) / 2;
      posY = sz.h * 0.05;
      // 우주 PC: 58.4% 확대, 400px 위로
      if (isGreeter) {
        sc   *= 1.584;
        posX  = (sz.w - mW * sc) / 2;
        posY += -400;
      }
    }

    return { sc: sc, x: posX, y: posY };
  }

  /* ──────────────────────────────────────
     8.  PIXI + 모델 초기화
  ────────────────────────────────────── */
  function setup() {
    var sz   = getContainerSize();
    var SZ_W = sz.w;
    var SZ_H = sz.h;

    var gc = document.getElementById("ghostContainer");
    var g  = document.getElementById("ghost");

    if (gc) {
      var isGameMode = document.body.classList.contains("is-game-mode");
      gc.style.setProperty("width",    SZ_W + "px", "important");
      gc.style.setProperty("height",   SZ_H + "px", "important");
      gc.style.setProperty("right",    "0",          "important");
      gc.style.setProperty("bottom",   "0",          "important");
      gc.style.setProperty("overflow", "visible",    "important");
      gc.style.setProperty("position", isGameMode ? "fixed" : "absolute", "important");
      gc.style.setProperty("z-index",  isGameMode ? "10000" : "2", "important");
    }
    if (g) {
      g.style.setProperty("width",    SZ_W + "px", "important");
      g.style.setProperty("height",   SZ_H + "px", "important");
      g.style.setProperty("overflow", "visible",   "important");
      g.querySelectorAll("img").forEach(function (img) { img.style.display = "none"; });
    }

    // PIXI: 캔버스 크기 = 컨테이너와 동일, resolution=1 고정 (autoDensity로 DPR 대응)
    app = new PIXI.Application({
      width:           SZ_W,
      height:          SZ_H,
      backgroundAlpha: 0,
      antialias:       true,
      autoDensity:     true,
      resolution:      1,  // 1 고정: autoDensity+dpr 조합 시 찌그러짐 방지
    });

    var cv = app.view;
    cv.id = "live2dCanvas";
    // CSS 크기 = 논리 픽셀 (autoDensity가 물리 픽셀 처리)
    cv.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      "width:"  + SZ_W + "px",
      "height:" + SZ_H + "px",
      "pointer-events:none",
      "display:block",
      "touch-action:none"
    ].join(";") + ";";

    function mountCanvas() {
      var target = document.getElementById("ghost");
      if (target) target.insertBefore(cv, target.firstChild);
      else document.body.appendChild(cv);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountCanvas);
    else mountCanvas();

    if (!buildBlobs(currentModelKey)) return;

    PIXI.live2d.Live2DModel.from(buildModelUrl(currentModelKey), { autoInteract: false })
      .then(function (m) {
        model = m;

        // 실제 internalModel 크기 기반으로 sc/posX 계산
        var mW = m.internalModel.width  || 1024;
        var mH = m.internalModel.height || 1024;
        var t  = calcTransform(mW, mH, sz, currentModelKey);
        m.scale.set(t.sc);
        m.x = t.x;
        m.y = t.y;
        app.stage.addChild(m);

        console.log(
          "[Live2D] 하루 로드 완료",
          mW + "x" + mH,
          "sc:" + t.sc.toFixed(3),
          "x:" + Math.round(t.x) + " y:" + Math.round(t.y),
          "container:" + SZ_W + "x" + SZ_H,
          sz.isMobile ? "(모바일)" : "(PC)"
        );

        // 모션 페이드 시간
        if (window.PIXI && PIXI.live2d && PIXI.live2d.config) {
          PIXI.live2d.config.motionFadingDuration     = 800;
          PIXI.live2d.config.idleMotionFadingDuration = 1500;
        }

        // 모션 전환 크로스페이드 패치 (투명 깜빡임 제거)
        patchMotionTransition(m);

        // 립싱크 훅 (beforeModelUpdate)
        hookLipsync(m, currentModelKey);
        // 마우스/자이로 눈동자 훅
        hookFocus(m);

        ready = true;
        window._live2dActive = true;
        applyEmotion("기본대기");
        if (pending) { applyEmotion(pending); pending = null; }

        // 게임 모드 전환 감지 → ghostContainer position/z-index/크기 갱신
        function _applyGameMode() {
          var gc2 = document.getElementById("ghostContainer");
          var g2  = document.getElementById("ghost");
          var cv2 = document.getElementById("live2dCanvas");
          if (!gc2) return;
          var gm = document.body.classList.contains("is-game-mode");
          var isMob2 = window.innerWidth <= 768;

          // transform 항상 제거 (parallax 등 외부 CSS 영향 차단)
          gc2.style.setProperty("transform", "none", "important");

          if (gm) {
            // 게임 모드: 우측 하단 작은 캐릭터 — PC/모바일 분기
            var gmW, gmH;
            if (isMob2) {
              // 모바일: 화면 우측 하단 약 28% 높이
              gmW = Math.round(window.innerWidth  * 0.28);
              gmH = Math.round(window.innerHeight * 0.26);
              gmW = Math.max(85,  Math.min(140, gmW));
              gmH = Math.max(140, Math.min(220, gmH));
            } else {
              // PC: 화면 우측 하단 약 32% 높이
              gmW = Math.round(window.innerWidth  * 0.14);
              gmH = Math.round(window.innerHeight * 0.32);
              gmW = Math.max(120, Math.min(200, gmW));
              gmH = Math.max(200, Math.min(300, gmH));
            }
            // position/z-index/크기/위치 모두 !important로 덮어쓰기
            gc2.style.setProperty("position", "fixed",         "important");
            gc2.style.setProperty("z-index",  "10000",          "important");
            gc2.style.setProperty("right",    "0",              "important");
            gc2.style.setProperty("bottom",   "0",              "important");
            gc2.style.setProperty("top",      "auto",           "important");
            gc2.style.setProperty("left",     "auto",           "important");
            gc2.style.setProperty("width",    gmW + "px",       "important");
            gc2.style.setProperty("height",   gmH + "px",       "important");
            gc2.style.setProperty("overflow", "visible",        "important");
            if (g2) {
              g2.style.setProperty("width",   gmW + "px",       "important");
              g2.style.setProperty("height",  gmH + "px",       "important");
            }
            if (cv2) {
              cv2.style.setProperty("width",  gmW + "px",       "important");
              cv2.style.setProperty("height", gmH + "px",       "important");
            }
            try { app && app.renderer && app.renderer.resize(gmW, gmH); } catch(_) {}
            if (model) {
              var mW2 = model.internalModel.width  || 1024;
              var mH2 = model.internalModel.height || 1024;
              var sc2 = (gmH * 1.15) / mH2;
              // 우주(greeter): 게임 모드에서 20% 크게 + 15px 아래
              if (currentModelKey === "greeter") sc2 *= 1.20;
              model.scale.set(sc2);
              model.x = (gmW - mW2 * sc2) / 2;
              model.y = gmH * 0.05 + (currentModelKey === "greeter" ? 15 : 0);
            }
          } else {
            // 일반 모드: 원래 크기로 복귀
            var sz2 = getContainerSize();
            gc2.style.setProperty("position", isMob2 ? "absolute" : "absolute", "important");
            gc2.style.setProperty("z-index",  "2",        "important");
            gc2.style.removeProperty("top");
            gc2.style.removeProperty("left");
            gc2.style.setProperty("right",  "0",            "important");
            gc2.style.setProperty("bottom", "0",            "important");
            gc2.style.setProperty("width",  sz2.w + "px",   "important");
            gc2.style.setProperty("height", sz2.h + "px",   "important");
            // transform 복구 (parallax용 CSS 변수 방식)
            gc2.style.setProperty("transform", "translate3d(var(--plx-x,0px),var(--plx-y,0px),0)", "important");
            if (g2) {
              g2.style.setProperty("width",  sz2.w + "px", "important");
              g2.style.setProperty("height", sz2.h + "px", "important");
            }
            if (cv2) {
              cv2.style.setProperty("width",  sz2.w + "px", "important");
              cv2.style.setProperty("height", sz2.h + "px", "important");
            }
            try { app && app.renderer && app.renderer.resize(sz2.w, sz2.h); } catch(_) {}
            if (model) {
              var mW3 = model.internalModel.width  || 1024;
              var mH3 = model.internalModel.height || 1024;
              var t2  = calcTransform(mW3, mH3, sz2, currentModelKey);
              model.scale.set(t2.sc);
              model.x = t2.x;
              model.y = t2.y;
            }
          }
        }
        // 전역 노출: game-manager.js에서도 직접 호출 가능
        window._applyLive2DGameMode = _applyGameMode;
        var _gameModeObserver = new MutationObserver(_applyGameMode);
        _gameModeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        // 현재 상태도 즉시 적용
        _applyGameMode();
      })
      .catch(function (e) { console.error("[Live2D] 모델 로드 오류:", e); });
  }

  /* ──────────────────────────────────────
     9.  감정 적용 (모션 + 표정)
         자연스러운 전환:
         - 같은 감정 반복: 무시 (불필요한 모션 재시작 방지)
         - 감정 변경: FadeOut(400ms) 후 새 모션 시작 → 끊김 없음
  ────────────────────────────────────── */
  var _currentEmotionName = null;
  var _transitionTimer    = null;

  function applyEmotion(name) {
    if (!ready) { pending = name; return; }

    var emoMap = (currentModelKey === "greeter") ? GREETER_EMOTION_CONFIG : EMOTION_CONFIG;
    var cfg = emoMap[name] || emoMap["기본대기"] || EMOTION_CONFIG["기본대기"];

    // 같은 감정 반복 호출이면 모션은 재시작하지 않음 (표정만 확인)
    if (name === _currentEmotionName) {
      if (cfg.expr && cfg.expr !== currentExpr) {
        try { model.expression(cfg.expr); currentExpr = cfg.expr; } catch (_) {}
      }
      return;
    }

    _currentEmotionName = name;
    currentLipsync = cfg.lipsync;

    // 표정은 즉시 전환 (FadeInDuration이 내장됨)
    if (cfg.expr && cfg.expr !== currentExpr && currentModelKey !== "greeter" && currentModelKey !== "hijiki") {
      try { model.expression(cfg.expr); currentExpr = cfg.expr; } catch (_) {}
    }

    // 모션 즉시 시작 (patchMotionTransition이 크로스페이드 처리)
    if (_transitionTimer) { clearTimeout(_transitionTimer); _transitionTimer = null; }
    if (cfg.motion) {
      try {
        model.motion(cfg.motion, 0, 3);
      } catch (e) {
        console.warn("[Live2D] 모션 실패:", cfg.motion, e);
      }
    }
  }

  /* ──────────────────────────────────────
     10.  공개 API
  ────────────────────────────────────── */
  window.onLive2DEmotionChange = function (n) { applyEmotion(n); };

  /* ── 립싱크 내부 시작 함수 ── */
  function _startLipsync() {
    var ph = Math.random() * Math.PI * 2;
    if (lipsyncTimer) clearInterval(lipsyncTimer);
    lipsyncTimer = setInterval(function () {
      ph += 0.28;
      // 기본파 + 고조파 → 자연스러운 입 움직임
      lipsyncTarg = Math.sin(ph) * 0.35
                  + Math.sin(ph * 2.1) * 0.10
                  + 0.55;
      lipsyncTarg = Math.max(0, Math.min(1, lipsyncTarg));
    }, 75);
  }

  /* 말풍선/TTS 시작
     text를 받으면 텍스트 길이 기반으로 자동 StopSpeaking 타이머 설정
     (TTS onstart보다 늦게 발화되는 Chrome 버그 대비) */
  var _autoStopTimer = null;
  window.onLive2DStartSpeaking = function (text) {
    if (_autoStopTimer) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
    _startLipsync();

    // TTS 없을 때만 텍스트 길이로 자동 종료 추정
    // 한국어 평균: 음절당 약 120ms (rate=1.0 기준)
    if (text && typeof text === "string") {
      var syllables = text.replace(/\s/g, "").length;
      var rateMultiplier = (window.ttsVoice && window.ttsVoice.getRate)
                           ? window.ttsVoice.getRate() : 1.0;
      var estimatedMs = Math.max(1000, (syllables * 120) / Math.max(0.5, rateMultiplier));
      _autoStopTimer = setTimeout(function () {
        window.onLive2DStopSpeaking();
      }, estimatedMs + 200);   // 200ms 여유
    }
  };

  /* TTS onboundary — 단어 경계마다 입 강도를 일시적으로 높임 */
  window.onLive2DBoundary = function (ev) {
    // 경계 이벤트 때 lipsyncTarg를 순간적으로 올려 음절 느낌 표현
    lipsyncTarg = Math.min(1, lipsyncTarg + 0.25);
  };

  /* 말풍선/TTS 종료 → 서서히 닫힘 */
  window.onLive2DStopSpeaking = function () {
    if (lipsyncTimer)    { clearInterval(lipsyncTimer);  lipsyncTimer    = null; }
    if (_autoStopTimer)  { clearTimeout(_autoStopTimer); _autoStopTimer  = null; }
    lipsyncTarg = 0;
  };

  /* ──────────────────────────────────────
     10-b.  캐릭터 스위치 (야옹이 ↔ 우주)
  ────────────────────────────────────── */
  window.onLive2DCharacterSwitch = function (modelKey) {
    if (modelKey === currentModelKey) return;
    console.log("[Live2D] 캐릭터 전환:", currentModelKey, "→", modelKey);

    window.onLive2DStopSpeaking();

    // 이전 모델만 스테이지에서 제거 (PIXI app/캔버스는 유지)
    if (model && app && app.stage) {
      app.stage.removeChild(model);
      try { model.destroy({ children: true }); } catch(_) {}
    }
    model               = null;
    ready               = false;
    pending             = null;
    blobUrls            = {};
    currentExpr         = null;
    _currentEmotionName = null;
    currentModelKey     = modelKey;

    // 새 모델만 로드해서 기존 스테이지에 추가
    if (!buildBlobs(currentModelKey)) return;
    PIXI.live2d.Live2DModel.from(buildModelUrl(currentModelKey), { autoInteract: false })
      .then(function (m) {
        model = m;
        var sz = getContainerSize();
        var mW = m.internalModel.width  || 1024;
        var mH = m.internalModel.height || 1024;
        var t  = calcTransform(mW, mH, sz, currentModelKey);
        m.scale.set(t.sc);
        m.x = t.x;
        m.y = t.y;

        if (PIXI.live2d && PIXI.live2d.config) {
          PIXI.live2d.config.motionFadingDuration     = 800;
          PIXI.live2d.config.idleMotionFadingDuration = 1500;
        }
        patchMotionTransition(m);
        hookLipsync(m, currentModelKey);
        hookFocus(m);

        app.stage.addChild(m);
        ready = true;
        window._live2dActive = true;
        applyEmotion("기본대기");
      })
      .catch(function(e) { console.error("[Live2D] 교체 오류:", e); });
  };

  /* ──────────────────────────────────────
     11.  말풍선 class 변화 감지 → 자동 립싱크
  ────────────────────────────────────── */
  function hookBubble() {
    var bw = document.getElementById("bubbleWrapper");
    if (!bw) {
      // bubbleWrapper가 아직 없으면 잠시 후 재시도
      setTimeout(hookBubble, 300);
      return;
    }
    new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        if (mu.attributeName !== "class") return;
        if (bw.classList.contains("visible")) {
          // TTS 없을 때만 → 텍스트 내용 함께 전달해서 길이 기반 타이밍 계산
          if (!window.ttsVoice || !window.ttsVoice.isEnabled()) {
            var textEl = document.getElementById("bubbleText");
            var txt = textEl ? (textEl.textContent || "") : "";
            window.onLive2DStartSpeaking(txt);
          }
        } else {
          // visible 해제 = 말풍선 닫힘
          if (!window.ttsVoice || !window.ttsVoice.isEnabled()) {
            window.onLive2DStopSpeaking();
          }
        }
      });
    }).observe(bw, { attributes: true });
    console.log("[Live2D] 말풍선 립싱크 훅 완료");
  }

  /* ──────────────────────────────────────
     12.  리사이즈 대응
  ────────────────────────────────────── */
  var _resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      if (!model || !ready) return;
      var sz = getContainerSize();

      var gc = document.getElementById("ghostContainer");
      var g  = document.getElementById("ghost");
      var cv = document.getElementById("live2dCanvas");

      if (gc) {
        gc.style.setProperty("width",  sz.w + "px", "important");
        gc.style.setProperty("height", sz.h + "px", "important");
        gc.style.setProperty("bottom", "0", "important");
        // left는 건드리지 않음 — right:0 기준
      }
      if (g) {
        g.style.setProperty("width",  sz.w + "px", "important");
        g.style.setProperty("height", sz.h + "px", "important");
      }
      if (cv) {
        cv.style.width  = sz.w + "px";
        cv.style.height = sz.h + "px";
      }

      // PIXI renderer 크기도 맞춤
      try { app && app.renderer && app.renderer.resize(sz.w, sz.h); } catch(_) {}

      var mW = model.internalModel.width  || 1024;
      var mH = model.internalModel.height || 1024;
      var t  = calcTransform(mW, mH, sz, currentModelKey);
      model.scale.set(t.sc);
      model.x = t.x;
      model.y = t.y;
    }, 300);
  });

  /* ──────────────────────────────────────
     13.  진입점
  ────────────────────────────────────── */
  function init() {
    if (!window.PIXI || !window.PIXI.live2d) {
      console.error("[Live2D] pixi-live2d.bundle.js 미로드");
      return;
    }
    // localStorage에서 저장된 캐릭터 키 복원
    try {
      var saved = window.localStorage && window.localStorage.getItem("ghostCurrentCharacter");
      if (saved === "greeter") {
        currentModelKey = "greeter";
        console.log("[Live2D] 저장된 캐릭터 복원: greeter");
      }
    } catch(e) {}
    setup();
    setTimeout(hookBubble, 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
