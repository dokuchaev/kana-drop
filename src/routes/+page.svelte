<script lang="ts">
  import { onMount } from 'svelte';
  import { KanaDropGame } from '$lib/game';
  import cabinetIcon from '../images/icon-lk.png';

  type Attempt = {
    id: number;
    timestamp: number;
    score: number;
    durationSeconds: number;
  };

  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  let canvas: HTMLCanvasElement;
  let game: KanaDropGame | undefined;
  let score = $state(0);
  let attempts = $state<Attempt[]>([]);
  let cabinetOpen = $state(false);
  let cabinetPausedGame = false;
  let storageError = $state('');
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

  let bestAttempt = $derived(
    attempts.reduce<Attempt | null>(
      (best, attempt) => (!best || attempt.score > best.score ? attempt : best),
      null
    )
  );

  function persistAttempts(nextAttempts: Attempt[]): boolean {
    try {
      localStorage.setItem('kanaDropAttempts', JSON.stringify(nextAttempts));
      attempts = nextAttempts;
      storageError = '';
      return true;
    } catch (error) {
      console.error('Не удалось сохранить результаты игры:', error);
      storageError = 'Не удалось сохранить результаты на этом устройстве.';
      return false;
    }
  }

  function recordAttempt() {
    const timestamp = Date.now();
    const nextAttempts = [
      {
        id: Math.max(timestamp, ...attempts.map((attempt) => attempt.id + 1)),
        timestamp,
        score,
        durationSeconds: seconds
      },
      ...attempts
    ].slice(0, 100);
    persistAttempts(nextAttempts);
  }

  function clearAttempts() {
    try {
      localStorage.removeItem('kanaDropAttempts');
      localStorage.removeItem('kanaDropBest');
      attempts = [];
      storageError = '';
    } catch (error) {
      console.error('Не удалось очистить результаты игры:', error);
      storageError = 'Не удалось очистить сохранённые результаты.';
    }
  }

  function openCabinet() {
    cabinetPausedGame = gameActive && !paused;
    if (cabinetPausedGame) game?.togglePause();
    cabinetOpen = true;
  }

  function closeCabinet() {
    cabinetOpen = false;
    if (cabinetPausedGame) {
      cabinetPausedGame = false;
      game?.togglePause();
    }
  }

  function startGame() {
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

  function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(timestamp);
  }

  onMount(() => {
    try {
      const storedAttempts: unknown = JSON.parse(localStorage.getItem('kanaDropAttempts') || '[]');
      if (!Array.isArray(storedAttempts)) throw new Error('Некорректный формат истории попыток');
      attempts = storedAttempts.filter(
        (attempt): attempt is Attempt =>
          typeof attempt === 'object' &&
          attempt !== null &&
          Number.isSafeInteger(attempt.id) &&
          Number.isFinite(attempt.timestamp) &&
          Number.isFinite(attempt.score) &&
          Number.isFinite(attempt.durationSeconds) &&
          attempt.score >= 0 &&
          attempt.durationSeconds >= 0
      ).slice(0, 100);
    } catch (error) {
      console.error('Не удалось загрузить результаты игры:', error);
      storageError = 'Не удалось загрузить сохранённые результаты.';
    }

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
        recordAttempt();
        feedback = manual ? 'Тест завершён' : 'Раунд завершён';
        feedbackColor = '#ff91a5';
      }
    });

    function handleKeydown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (cabinetOpen) {
        if (event.key === 'Escape') closeCabinet();
        return;
      }
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
        class="control-button cabinet-button"
        aria-label="Личный кабинет"
        title="Личный кабинет"
        aria-haspopup="dialog"
        onclick={openCabinet}
      ><img src={cabinetIcon} alt="" /></button>
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
        </div>
      {/each}
    </div>
  </section>
  {#if cabinetOpen}
    <div
      class="cabinet-backdrop"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) closeCabinet();
      }}
    >
      <div class="cabinet-dialog" role="dialog" aria-modal="true" aria-labelledby="cabinet-title" tabindex="-1">
        <header class="cabinet-header">
          <div class="cabinet-heading">
            <img src={cabinetIcon} alt="" />
            <div>
              <h1 id="cabinet-title">Личный кабинет</h1>
              <p>Твои тренировочные попытки</p>
            </div>
          </div>
          <button class="cabinet-close" aria-label="Закрыть кабинет" onclick={closeCabinet}>×</button>
        </header>

        {#if bestAttempt}
          <section class="best-attempt" aria-label="Лучшая попытка">
            <span class="cabinet-label">ЛУЧШАЯ ПОПЫТКА</span>
            <strong>{bestAttempt.score} очков</strong>
            <span>Время: {formatTime(bestAttempt.durationSeconds)}</span>
          </section>
        {:else}
          <section class="best-attempt empty-best">Сыграй первый раунд — здесь появится лучший результат.</section>
        {/if}

        <div class="attempts-heading">
          <h2>История попыток <span>{attempts.length}</span></h2>
          <button class="clear-results" disabled={attempts.length === 0} onclick={clearAttempts}>Очистить результаты</button>
        </div>
        {#if storageError}
          <p class="storage-error" role="alert">{storageError}</p>
        {/if}
        {#if attempts.length}
          <ol class="attempt-list">
            {#each attempts as attempt (attempt.id)}
              <li>
                <span class="attempt-date">{formatDate(attempt.timestamp)}</span>
                <strong>{attempt.score} очков</strong>
                <span>{formatTime(attempt.durationSeconds)}</span>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="empty-attempts">Завершённые игры будут записываться здесь.</p>
        {/if}
      </div>
    </div>
  {/if}
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
  .cabinet-button { overflow: hidden; padding: 0; }
  .cabinet-button img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
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
  .cabinet-backdrop {
    position: fixed;
    z-index: 30;
    inset: 0;
    display: grid;
    place-items: center;
    padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
    background: #07101ddd;
    backdrop-filter: blur(5px);
  }
  .cabinet-dialog {
    width: min(100%, 560px);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 20px;
    color: #edf4ff;
    background: #182a46;
    border: 4px solid #5277a7;
    border-radius: 8px;
    box-shadow: 8px 8px 0 #091426;
  }
  .cabinet-header, .cabinet-heading, .attempts-heading, .attempt-list li {
    display: flex;
    align-items: center;
  }
  .cabinet-header, .attempts-heading { justify-content: space-between; gap: 12px; }
  .cabinet-heading { min-width: 0; gap: 12px; }
  .cabinet-heading img { width: 44px; height: 44px; object-fit: contain; image-rendering: pixelated; }
  .cabinet-heading h1 { margin: 0; font-size: 22px; }
  .cabinet-heading p { margin: 4px 0 0; color: #a8bddc; font-size: 12px; }
  .cabinet-close {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    color: #fff;
    background: #2b4164;
    border: 2px solid #5277a7;
    border-radius: 4px;
    font-size: 25px;
    line-height: 1;
    cursor: pointer;
  }
  .best-attempt {
    display: grid;
    gap: 5px;
    margin: 18px 0;
    padding: 14px;
    background: #263d60;
    border: 2px solid #f1c95d;
  }
  .best-attempt strong { color: #ffe176; font-size: 24px; }
  .best-attempt > span:last-child { color: #c2d1e8; font-size: 13px; }
  .cabinet-label { color: #f1d473; font-size: 10px; font-weight: 900; letter-spacing: .12em; }
  .empty-best { color: #c2d1e8; font-size: 13px; }
  .attempts-heading { margin-bottom: 8px; }
  .attempts-heading h2 { margin: 0; font-size: 16px; }
  .attempts-heading h2 span { color: #a8bddc; font-size: 13px; }
  .clear-results {
    padding: 7px 9px;
    color: #ffd0c9;
    background: #58354a;
    border: 1px solid #9a6171;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }
  .clear-results:disabled { opacity: .45; cursor: not-allowed; }
  .attempt-list {
    display: grid;
    gap: 6px;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0 4px 0 0;
    list-style: none;
  }
  .attempt-list li {
    min-height: 40px;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 9px;
    background: #0e1b30;
    border: 1px solid #344d70;
    font-size: 12px;
  }
  .attempt-list li strong { color: #ffe176; white-space: nowrap; }
  .attempt-date, .attempt-list li > span:last-child { color: #b5c6df; }
  .empty-attempts, .storage-error { margin: 12px 0 0; color: #b5c6df; font-size: 13px; }
  .storage-error { color: #ffad9e; }
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
    .overlay { backdrop-filter: none; }
    .key-row { gap: 3px; }
    .key {
      width: min(36px, calc((100vw - 39px) / 10));
      height: clamp(44px, 5.4dvh, 48px);
      flex: 0 0 min(36px, calc((100vw - 39px) / 10));
      font-size: 24px;
    }
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
