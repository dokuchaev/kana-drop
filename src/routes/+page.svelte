<script lang="ts">
  import { onMount } from 'svelte';
  import { KanaDropGame } from '$lib/game';

  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  let canvas: HTMLCanvasElement;
  let game: KanaDropGame | undefined;
  let score = $state(0);
  let best = $state(0);
  let hits = $state(0);
  let mistakes = $state(0);
  let seconds = $state(0);
  let paused = $state(false);
  let gameActive = $state(false);
  let typed = $state('');
  let feedback = $state('Готов к старту');
  let feedbackColor = $state('');
  let overlayVisible = $state(true);
  let gameOver = $state(false);
  let manuallyEnded = $state(false);
  let damageFlash = $state(false);
  let damageFlashTimer: ReturnType<typeof setTimeout>;

  function saveBestScore() {
    if (score > best) {
      best = score;
      localStorage.setItem('kanaDropBest', String(best));
    }
  }

  function startGame() {
    saveBestScore();
    game?.start();
    overlayVisible = false;
    gameOver = false;
    manuallyEnded = false;
    gameActive = true;
    mistakes = 0;
    hits = 0;
    damageFlash = false;
  }

  function flashDamage() {
    damageFlash = false;
    requestAnimationFrame(() => (damageFlash = true));
    clearTimeout(damageFlashTimer);
    damageFlashTimer = setTimeout(() => (damageFlash = false), 320);
  }

  function formatTime(value: number): string {
    const minutes = Math.floor(value / 60).toString().padStart(2, '0');
    const remainder = (value % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  onMount(() => {
    best = Number(localStorage.getItem('kanaDropBest') || 0);
    game = new KanaDropGame(canvas, {
      onScore: (value) => (score = value),
      onProgress: (value) => (hits = value),
      onMistake: (value) => {
        mistakes = value;
        flashDamage();
      },
      onTimer: (value) => (seconds = value),
      onPaused: (value) => (paused = value),
      onTyped: (value) => (typed = value),
      onFeedback: (message, color = '') => {
        feedback = message;
        feedbackColor = color;
      },
      onGameOver: (manual = false) => {
        gameOver = true;
        manuallyEnded = manual;
        gameActive = false;
        overlayVisible = true;
        saveBestScore();
        feedback = manual ? 'Тест завершён' : 'Раунд завершён';
        feedbackColor = '#ff91a5';
      }
    });

    function handleKeydown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'backspace') {
        event.preventDefault();
        game?.input('backspace');
      } else if (/^[a-z]$/.test(key)) {
        game?.input(key);
      } else if (key === 'escape') {
        game?.input('clear');
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      clearTimeout(damageFlashTimer);
      game?.destroy();
    };
  });
</script>

<svelte:head>
  <title>Kana Drop — тренажёр хираганы</title>
  <meta
    name="description"
    content="Игровой тренажёр для изучения хираганы. Вводи чтение ромадзи и защищай базу!"
  />
</svelte:head>

<main class="app">
  <header class="topbar">
    <div class="score-block">
      <span class="hud-label">Счёт</span>
      <strong class="score-value">{score}</strong>
    </div>
    <div class="wave-block" aria-label={`Поймано ${hits}, ошибок ${mistakes}`}>
      <div class="wave-count">{hits} <span>ПОЙМАНО</span></div>
      <div class="mistakes-count">ОШИБКИ <strong>{mistakes}</strong></div>
    </div>
    <div class="hud-actions">
      <div class="timer">
        <span class="timer-icon" aria-hidden="true">◷</span>
        <span>{formatTime(seconds)}</span>
      </div>
      <button
        class="pause-button"
        aria-label={paused ? 'Продолжить игру' : 'Пауза'}
        title={paused ? 'Продолжить' : 'Пауза'}
        disabled={!gameActive}
        onclick={() => game?.togglePause()}
      >
        {#if paused}<span class="play-icon">▶</span>{:else}<span class="pause-icon">Ⅱ</span>{/if}
      </button>
      <button
        class="control-button end-button"
        aria-label="Завершить тест"
        title="Завершить тест"
        disabled={!gameActive}
        onclick={() => game?.end()}
      >■</button>
      <button
        class="control-button restart-button"
        aria-label="Перезапустить тест"
        title="Перезапустить тест"
        onclick={startGame}
      >↻</button>
    </div>
  </header>

  <section class="game-card" aria-label="Игровое поле">
    <div class="arena">
      <canvas bind:this={canvas} aria-label="Ниндзя стреляет сюрикенами по падающим символам хираганы"></canvas>
      {#if overlayVisible}
        <div class="overlay" class:paused>
          <div class="overlay-panel">
            <div class="overlay-kana">{gameOver ? 'おつかれ!' : 'あ'}</div>
            <h1>{gameOver ? (manuallyEnded ? 'Тест завершён' : 'Игра окончена') : 'Поймай все каны'}</h1>
            <p>
              {gameOver
                ? `Твой счёт — ${score}. Попробуешь побить рекорд?`
                : 'Ниндзя готов! Вводи ромадзи падающих символов — он метнёт сюрикен в нужную цель. Не дай им добраться до земли!'}
            </p>
            <button class="primary-button" onclick={startGame}>
              {gameOver ? 'Играть ещё' : 'Начать игру'}
            </button>
          </div>
        </div>
      {/if}
    </div>
    <div class="entry-row" aria-live="polite">
      <span class="entry-label">ТВОЙ ВВОД</span>
      <output class:empty={!typed} class="romaji-entry" aria-label="Введённое ромадзи">
        {typed || '···'}
      </output>
      <span class="feedback" style:color={feedbackColor || undefined}>{feedback}</span>
    </div>
  </section>

  <section class="keyboard-card" aria-label="Виртуальная клавиатура">
    <div class="keyboard">
      {#each rows as row}
        <div class="key-row">
          {#each row as key}
            <button class="key" data-key={key} onclick={() => game?.input(key)}>{key.toUpperCase()}</button>
          {/each}
          {#if row === 'zxcvbnm'}
            <button class="key utility" data-key="backspace" aria-label="Стереть" onclick={() => game?.input('backspace')}>
              ⌫ СТЕРЕТЬ
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </section>
  <div class="footer-note">Набери чтение каны, пока она не коснулась земли</div>
  <div class="damage-flash" class:active={damageFlash} aria-hidden="true"></div>
</main>

<style>
  :global(:root) {
    color-scheme: dark;
    --bg: #101521;
    --text: #f4f4f1;
    --muted: #9ba9bb;
    --cyan: #7de5dc;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-synthesis: none;
  }

  :global(*) { box-sizing: border-box; }
  :global(body) {
    min-height: 100vh;
    margin: 0;
    color: var(--text);
    background: radial-gradient(ellipse at 50% -20%, #26394b 0, transparent 46%), var(--bg);
  }
  :global(button) { font: inherit; }
  .app {
    width: min(100%, 1040px);
    min-height: 100vh;
    margin: 0 auto;
    padding: 22px 28px 26px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .topbar, .brand, .stats, .stat, .game-heading, .entry-row {
    display: flex;
    align-items: center;
  }
  .topbar { justify-content: space-between; }
  .brand { gap: 12px; }
  .brand-mark {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    color: var(--bg);
    background: var(--cyan);
    border-radius: 13px;
    font-size: 25px;
    font-weight: 800;
    box-shadow: 0 0 28px #7de5dc30;
  }
  .brand-name { font-size: 17px; font-weight: 800; letter-spacing: .02em; }
  .brand-caption { margin-top: 2px; color: var(--muted); font-size: 12px; }
  .stats { gap: 10px; }
  .stat {
    min-width: 94px;
    justify-content: center;
    gap: 8px;
    padding: 9px 13px;
    background: #ffffff08;
    border: 1px solid #ffffff10;
    border-radius: 12px;
  }
  .stat-label { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
  .stat-value { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .game-card, .keyboard-card {
    overflow: hidden;
    background: #151d29;
    border: 1px solid #ffffff12;
    border-radius: 18px;
    box-shadow: 0 16px 48px #00000020;
  }
  .game-heading {
    min-height: 55px;
    justify-content: space-between;
    padding: 0 18px;
    border-bottom: 1px solid #ffffff0e;
  }
  .game-title { display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 750; }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 10px var(--cyan); }
  .game-hint { color: var(--muted); font-size: 12px; }
  .arena {
    position: relative;
    height: clamp(300px, 48vh, 490px);
    min-height: 300px;
    overflow: hidden;
    background: linear-gradient(180deg, #182434 0%, #192434 68%, #202b38 100%);
  }
  .arena::before {
    position: absolute;
    inset: 0;
    content: "";
    pointer-events: none;
    background-image: radial-gradient(#d8e7f20a 1px, transparent 1px);
    background-size: 24px 24px;
  }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    padding: 20px;
    background: #101521a8;
    backdrop-filter: blur(5px);
  }
  .overlay-panel { width: min(100%, 390px); text-align: center; }
  .overlay-kana { color: var(--cyan); font-size: 54px; line-height: 1; }
  .overlay h1 { margin: 13px 0 8px; font-size: clamp(24px, 6vw, 32px); letter-spacing: -.04em; }
  .overlay p { margin: 0 auto 22px; max-width: 330px; color: #bfccd9; font-size: 14px; line-height: 1.6; }
  .primary-button {
    min-height: 48px;
    padding: 0 25px;
    color: #102128;
    background: var(--cyan);
    border: 0;
    border-radius: 12px;
    font-weight: 850;
    cursor: pointer;
    box-shadow: 0 7px 25px #7de5dc28;
    transition: transform .15s ease, filter .15s ease;
  }
  .primary-button:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .entry-row {
    min-height: 76px;
    justify-content: center;
    gap: 11px;
    background: #121925;
    border-top: 1px solid #ffffff0b;
  }
  .entry-label { color: var(--muted); font-size: 12px; }
  .romaji-entry {
    width: 116px;
    min-height: 43px;
    display: grid;
    place-items: center;
    padding: 4px 12px;
    color: var(--cyan);
    background: #7de5dc0d;
    border: 1px solid #7de5dc48;
    border-radius: 11px;
    font-size: 20px;
    font-weight: 850;
    letter-spacing: .08em;
  }
  .romaji-entry.empty { color: #607080; }
  .feedback { width: 95px; color: var(--muted); font-size: 12px; }
  .keyboard-card { padding: 14px 18px 17px; }
  .keyboard { display: grid; gap: 7px; max-width: 680px; margin: 0 auto; }
  .key-row { display: flex; justify-content: center; gap: 6px; }
  .key {
    min-width: 0;
    width: 8.3%;
    height: 40px;
    color: #dce4ec;
    background: linear-gradient(180deg, #273345, #202b3b);
    border: 1px solid #ffffff12;
    border-bottom-color: #ffffff24;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition: background .12s ease, transform .08s ease;
  }
  .key:active { background: #37505d; transform: translateY(1px); }
  .key.utility { width: 13%; color: var(--cyan); font-size: 11px; }
  .key.space { width: 38%; color: var(--muted); font-size: 10px; }
  .footer-note { color: #748296; text-align: center; font-size: 11px; }
  @media (max-width: 600px) {
    .app { gap: 11px; padding: max(12px, env(safe-area-inset-top)) 12px max(14px, env(safe-area-inset-bottom)); }
    .brand { gap: 8px; }
    .brand-mark { width: 36px; height: 36px; border-radius: 11px; font-size: 21px; }
    .brand-name { font-size: 14px; }
    .brand-caption { font-size: 10px; }
    .stats { gap: 5px; }
    .stat { min-width: 61px; padding: 7px 8px; gap: 5px; flex-direction: column; }
    .stat-label { font-size: 8px; }
    .stat-value { font-size: 13px; }
    .game-card, .keyboard-card { border-radius: 14px; }
    .game-heading { min-height: 43px; padding: 0 12px; }
    .game-title { font-size: 11px; }
    .game-hint { max-width: 48%; text-align: right; font-size: 10px; }
    .arena { height: clamp(250px, 40vh, 390px); min-height: 250px; }
    .danger-line { bottom: 60px; }
    .entry-row { min-height: 65px; gap: 8px; }
    .entry-label { font-size: 10px; }
    .romaji-entry { width: 86px; min-height: 38px; font-size: 18px; }
    .feedback { width: 77px; font-size: 10px; }
    .keyboard-card { padding: 12px 8px 13px; }
    .keyboard { gap: 6px; }
    .key-row { gap: 4px; }
    .key { height: clamp(34px, 9vw, 40px); border-radius: 6px; font-size: 12px; }
    .key.utility { width: 15%; font-size: 9px; }
    .key.space { width: 35%; font-size: 9px; }
    .footer-note { font-size: 9px; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(*), :global(*::before), :global(*::after) { scroll-behavior: auto !important; transition: none !important; }
  }

  :global(:root) {
    --bg: #15223a;
    --text: #f5f4ef;
    --muted: #b9c8e2;
    --cyan: #77d9ff;
    font-family: "Courier New", ui-monospace, monospace;
  }
  :global(body) {
    width: 100%;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: #15223a;
    image-rendering: pixelated;
  }
  .app {
    width: min(100%, 2300px);
    height: 100vh;
    height: 100dvh;
    min-height: 0;
    margin: 0 auto;
    padding: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
    background: #15223a;
    box-shadow: 0 0 80px #08132655;
    overflow: hidden;
  }
  .topbar {
    height: clamp(64px, 7dvh, 76px);
    min-height: 64px;
    padding: 6px 3%;
    display: grid;
    grid-template-columns: 1fr minmax(220px, 34vw) 1fr;
    gap: 28px;
    background: #17233a;
    border-bottom: 4px solid #263757;
    box-shadow: 0 8px 25px #08132655;
    z-index: 2;
  }
  .score-block { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; }
  .hud-label { color: #bac9e4; font-size: 19px; font-weight: 800; }
  .score-value { margin-top: 4px; font-size: 38px; line-height: 1; }
  .wave-block { display: grid; gap: 5px; align-self: center; }
  .wave-count { text-align: center; font-size: 25px; font-weight: 900; }
  .wave-count span { color: #bfcae0; }
  .mistakes-count { color: #ffad9e; text-align: center; font-size: 11px; font-weight: 800; }
  .mistakes-count strong { margin-left: 4px; color: #fff; font-size: 14px; }
  .hud-actions { display: flex; align-items: center; justify-content: flex-end; gap: clamp(6px, 1vw, 16px); }
  .timer { display: flex; align-items: center; gap: 10px; color: #f5f4ef; font-size: 25px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .timer-icon { color: #c5e9ff; font-family: sans-serif; font-size: 44px; line-height: .8; }
  .pause-button {
    width: 60px;
    height: 60px;
    display: grid;
    place-items: center;
    color: #e6f0ff;
    background: #293c60;
    border: 5px solid #405780;
    border-radius: 10px;
    box-shadow: inset 0 0 0 3px #1d2c49;
    cursor: pointer;
    touch-action: manipulation;
  }
  .control-button {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    color: #e6f0ff;
    background: #293c60;
    border: 4px solid #405780;
    border-radius: 8px;
    box-shadow: inset 0 0 0 2px #1d2c49;
    font: 900 23px/1 Arial, sans-serif;
    cursor: pointer;
    touch-action: manipulation;
  }
  .end-button { color: #ffad9e; }
  .restart-button { color: #b9e8ff; font-size: 29px; }
  .pause-button:disabled, .control-button:disabled { opacity: .45; cursor: not-allowed; }
  .pause-icon { font-size: 32px; line-height: 1; font-family: Arial, sans-serif; font-weight: 900; }
  .play-icon { font-size: 20px; }
  .game-card {
    width: calc(100% - 24px);
    max-width: 2200px;
    height: calc(100% - 24px);
    min-height: 0;
    margin: 12px auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #4c9fe7;
    border: 4px solid #293b5b;
    border-radius: 8px;
    box-shadow: 0 12px 30px #08132655;
  }
  .arena {
    height: auto;
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    background: #579fe3;
    image-rendering: pixelated;
  }
  .arena::before { display: none; }
  canvas { image-rendering: pixelated; }
  .entry-row {
    min-height: 58px;
    flex: 0 0 58px;
    justify-content: center;
    gap: 14px;
    background: #1b2942;
    border-top: 3px solid #354b70;
  }
  .entry-label { color: #c5d5ef; font-size: 12px; font-weight: 900; letter-spacing: .1em; }
  .romaji-entry {
    min-height: 40px;
    width: 108px;
    color: #fff;
    background: #293c60;
    border: 2px solid #59729f;
    border-radius: 5px;
    font-size: 20px;
  }
  .romaji-entry.empty { color: #9bacc9; }
  .feedback { width: auto; min-width: 100px; color: #d7e4fa; font-size: 12px; }
  .keyboard-card {
    margin: 0;
    padding: 8px 18px 12px;
    background: #17233a;
    border: 0;
    border-top: 2px solid #34486d;
    border-radius: 0;
    box-shadow: none;
  }
  .keyboard { gap: 6px; }
  .key-row { gap: 5px; }
  .key {
    height: 42px;
    color: #e3edff;
    background: #263957;
    border: 1px solid #3e567d;
    border-bottom: 4px solid #1b2942;
    border-radius: 4px;
    font-family: inherit;
    font-size: 15px;
    box-shadow: 0 2px 0 #0d1729;
  }
  .key:active { background: #375782; transform: translateY(2px); }
  .key.utility { width: 16%; color: #ffb09f; font-size: 12px; }
  .footer-note { display: none; }
  .damage-flash {
    position: fixed;
    z-index: 20;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    background: #ff233b;
  }
  .damage-flash.active { animation: damage-flash .32s steps(2, end) both; }
  @keyframes damage-flash {
    0% { opacity: .58; }
    100% { opacity: 0; }
  }
  .overlay {
    background: #18355755;
    backdrop-filter: blur(2px);
  }
  .overlay-panel {
    padding: 26px;
    color: #18233a;
    background: #e9f3ffed;
    border: 5px solid #35547c;
    box-shadow: 8px 8px 0 #16294599;
  }
  .overlay-kana { color: #ed4267; font-weight: 900; text-shadow: 3px 3px 0 #ffc4d4; }
  .overlay h1 { font-size: 25px; }
  .overlay p { color: #405477; }
  .primary-button {
    color: white;
    background: #ed5572;
    border: 3px solid #ad304f;
    border-radius: 4px;
    box-shadow: 4px 4px 0 #9f2e4b;
    font-family: inherit;
    text-transform: uppercase;
  }
  @media (min-width: 768px) {
    .keyboard-card { display: none; }
    .game-card { grid-row: 2; }
  }
  @media (max-width: 600px) {
    .app {
      width: 100%;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    .topbar {
      height: 56px;
      min-height: 56px;
      padding: 4px 8px;
      grid-template-columns: .65fr .9fr 1.45fr;
      gap: 8px;
      border-bottom-width: 3px;
    }
    .hud-label { font-size: 13px; }
    .score-value { font-size: 25px; }
    .wave-block { gap: 2px; }
    .wave-count { font-size: 15px; line-height: 1.1; }
    .wave-count span { display: block; font-size: 8px; }
    .mistakes-count { font-size: 8px; }
    .mistakes-count strong { font-size: 10px; }
    .hud-actions { gap: 4px; }
    .timer { gap: 0; font-size: 10px; }
    .timer-icon { display: none; }
    .pause-button { width: 30px; height: 30px; border-width: 2px; border-radius: 5px; }
    .pause-icon { font-size: 23px; }
    .control-button { width: 30px; height: 30px; border-width: 2px; border-radius: 5px; font-size: 17px; }
    .restart-button { font-size: 22px; }
    .game-card {
      width: 100%;
      height: 100%;
      margin: 0;
      border-width: 3px;
      border-radius: 0;
    }
    .arena {
      flex: 1 1 auto;
      min-height: 0;
    }
    .entry-row { display: none; }
    .keyboard-card { padding: 4px 6px max(4px, env(safe-area-inset-bottom)); }
    .keyboard { gap: 2px; }
    .key-row { gap: 3px; }
    .key { width: auto; height: clamp(44px, 5.4dvh, 48px); flex: 1 1 0; font-size: 24px; }
    .key.utility { width: 17%; flex: 0 0 17%; font-size: 10px; }
    .footer-note { font-size: 8px; }
  }
  @media (min-width: 601px) and (max-width: 767px) {
    .app { width: 100%; }
    .app { grid-template-rows: auto minmax(0, 1fr) auto; }
    .game-card { width: calc(100% - 28px); height: calc(100% - 20px); margin: 10px auto; }
    .arena { flex: 1 1 auto; min-height: 0; }
    .entry-row { display: none; }
  }
  @media (max-height: 760px) {
    .topbar { height: 64px; min-height: 64px; padding-block: 4px; }
    .score-value { font-size: 31px; }
    .hud-label { font-size: 15px; }
    .timer-icon { font-size: 36px; }
    .pause-button { width: 50px; height: 50px; }
    .game-card { height: calc(100% - 12px); margin-block: 6px; }
    .entry-row { min-height: 50px; flex-basis: 50px; }
    .romaji-entry { min-height: 34px; }
  }
  @media (max-width: 600px) and (max-height: 760px) {
    .topbar { height: 56px; min-height: 56px; }
    .score-value { font-size: 25px; }
    .hud-label { font-size: 12px; }
    .pause-button { width: 30px; height: 30px; }
    .game-card { height: 100%; margin-block: 0; }
    .keyboard { gap: 2px; }
    .key-row { gap: 3px; }
    .key { height: 44px; }
  }
</style>
