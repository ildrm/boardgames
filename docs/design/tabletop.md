# Modern Tabletop design brief

The interface reads like a small tabletop shared by two people. Use warm ivory around the game, paper-white controls, deep green for the primary action and mint plus copper motifs for pieces. The board stays visually dominant on a phone and a desktop. The original board illustrations use the same geometry as the playable grids.

| Direction applied to the waiting room and board | Clarity /25 | Identity /20 | Fit /15 | Mobility /20 | Extensibility /10 | Cost /10 | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Modern Tabletop. Ivory lobby, framed forest grid, cross/ring and patterned discs. | 23 | 17 | 14 | 18 | 9 | 9 | 90 |
| Paper & Ink. Cream lobby with serif labels, flat ink and rust board. | 21 | 16 | 14 | 16 | 8 | 9 | 84 |
| Arcade Geometry. Dark lobby with sharp cobalt and gold cells. | 19 | 16 | 10 | 15 | 8 | 8 | 76 |

The scores reflect a desk review of the same lobby and board layout. Modern Tabletop was selected for legible pieces and a calm invitation flow. User testing remains open.

| State | Desktop composition | Phone composition |
|---|---|---|
| Catalog | Centered title and two equal game cards with original board illustrations | Two stacked cards with clear game names and actions |
| Create and invite | Game illustration beside a compact join/create form | Title, instruction, optional name and primary action in reading order |
| Host lobby | Two seats, invitation field and one Start action with a visible reason while disabled | Compact seat rows, then copy/share and Start |
| Guest lobby | Same roster with waiting status | Waiting message immediately above the seats |
| Active | Seat identities, turn, board and quiet secondary rules/resign actions | Same reading order, board spans available width |
| Pause | Board remains visible beneath a persistent connection banner | Inline banner wraps without obscuring the grid |
| Result | Status and next action beside or below the finished board | Finished board, result reason, rematch/return action |
| Recovery | One focused explanation and a recovery action | Same hierarchy with no horizontal overflow |
| Preferences and rules | Titled dialog, contained focus, Escape and explicit actions | Scrollable dialog with label and close control reachable |

The brand mark uses separate tabletop pieces. X and O use strokes and a ring. Four in a Row pairs single-dot mint with ringed copper. Use Manrope and Vazirmatn with their open font license notices. Use logical margins in Persian and keep both physical boards left-to-right. Keep audio muted initially and pair it with visible feedback. Honor reduced-motion settings.

Review both themes at 320, 390 and 1440 CSS pixels first. Check target size, keyboard focus, long Persian names and same-nickname seats, then repeat at the other documented breakpoints. Measure contrast on actual rendered pairs. Log browser evidence separately from this design reference.

[Full screen, token and interaction specification](../MEGA_PROMPT.md#design)

## Design evidence

The concept sheet applies each direction to the same seats and board. The browser renders below show the selected direction with real room and game state.

- [Concept sheet](directions.svg)
- [Desktop catalog](../qa/screenshots/catalog-desktop-en.png)
- [Desktop lobby after guest arrival](../qa/screenshots/lobby-ready-desktop.png)
- [Persian dark theme at 320 px](../qa/screenshots/tic-tac-toe-mobile-fa-dark.png)
- [Mobile Four in a Row result](../qa/screenshots/four-in-a-row-result-mobile-en.png)

The favicon and game illustrations are original vector artwork in the web source. Both illustrations depict legal positions. Synthesized cues use short sine tones without a downloadable recording. Manrope and Vazirmatn ship with the OFL in their Fontsource packages. Lucide's icon license is supplied with the installed package. These are the sources used in the current build.

[Shipped token contrast spot checks](contrast.md)
