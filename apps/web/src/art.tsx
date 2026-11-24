export function GameArt({ gameId, compact = false }: { gameId: string; compact?: boolean }) {
  const discGame = gameId === 'four-in-a-row';
  return <div className={'game-art ' + (discGame ? 'art-disc ' : 'art-mark ') + (compact ? 'art-compact' : '')} aria-hidden="true">
    {discGame ? <svg viewBox="0 0 420 224" preserveAspectRatio="xMidYMid slice">
      <path className="art-orbit" d="M0 183H420M0 42H420M75 0V224M346 0V224M0 223H420M0 2H420"/>
      <path className="art-orbit" d="m58 42 34 0m-17-17v34m253 124h36m-18-18v36"/>
      <rect x="109" y="32" width="202" height="159" rx="15" className="art-tray" />
      {Array.from({ length: 42 }, (_, i) => {
        const pattern: Record<number, 'a' | 'b'> = { 31: 'a', 32: 'b', 37: 'b', 38: 'a', 39: 'a', 40: 'b' };
        const cx = 135 + (i % 7) * 25;
        const cy = 52 + Math.floor(i / 7) * 24;
        return <g key={i}><circle cx={cx} cy={cy} r="8.5" className={pattern[i] ? 'art-piece-' + pattern[i] : 'art-hole'} />
          {pattern[i] === 'a' && <circle cx={cx} cy={cy} r="2" className="art-pip" />}
          {pattern[i] === 'b' && <circle cx={cx} cy={cy} r="4" className="art-ring" />}
        </g>;
      })}
      <circle cx="345" cy="82" r="12" className="art-piece-a" /><circle cx="345" cy="82" r="2.5" className="art-pip" />
      <circle cx="75" cy="146" r="12" className="art-piece-b" /><circle cx="75" cy="146" r="6" className="art-ring" />
    </svg> : <svg viewBox="0 0 420 224" preserveAspectRatio="xMidYMid slice">
      <path className="art-orbit" d="M0 183H420M0 42H420M75 0V224M346 0V224M0 2H420M0 223H420" />
      <path className="art-orbit" d="m58 42 34 0m-17-17v34m253 124h36m-18-18v36" />
      <circle cx="210" cy="112" r="100" className="art-orbit" />
      <rect x="132" y="34" width="156" height="156" rx="15" className="art-tray" />
      <path d="M184 45v134m52-134v134M143 86h134M143 138h134" className="art-grid-line" />
      <path d="M147 49l22 22m0-22-22 22M199 101l22 22m0-22-22 22M251 153l22 22m0-22-22 22" className="art-x" />
      <circle cx="210" cy="60" r="11" className="art-o" /><circle cx="158" cy="112" r="11" className="art-o" />
      <path d="m333 75 14 14m0-14-14 14" className="art-x satellite" />
      <circle cx="75" cy="146" r="9" className="art-o satellite" />
    </svg>}
  </div>;
}
