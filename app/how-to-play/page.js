import Link from "next/link";
export const metadata = {
  title: "How to Play the Arrow Puzzle",
  description:
    "Learn how to play ArrowOut: clear blocked arrow paths, protect your three hearts, use hints, and race friends on the same puzzle.",
  alternates: { canonical: "/how-to-play" },
  openGraph: {
    title: "How to Play ArrowOut",
    url: "https://arrowout.xyz/how-to-play",
  },
};
export default function HowToPlay() {
  return (
    <main className="play-guide">
      <Link href="/" className="guide-brand">
        ARROW//OUT
      </Link>
      <h1>How to play ArrowOut</h1>
      <p>
        ArrowOut is a free online arrow escape puzzle. Read the tangled paths
        and clear the board one arrow at a time. Play in your browser on a
        phone, tablet, or computer.
      </p>
      <h2>Clear a path to the edge</h2>
      <ol>
        <li>Follow an arrow from its head in the direction it points.</li>
        <li>
          If its route to the board edge is clear, tap or click it to let it
          escape.
        </li>
        <li>
          If another path blocks it, remove the blocking arrow first. An arrow's
          own tail can also block its route.
        </li>
        <li>Keep clearing paths until every arrow has escaped.</li>
      </ol>
      <h2>Protect your three hearts</h2>
      <p>
        Each round starts with three hearts. A blocked tap costs one heart. Lose
        all three and restart the puzzle. Use the hint button to highlight an
        arrow with a clear exit.
      </p>
      <h2>Choose your puzzle mode</h2>
      <ul>
        <li>
          <strong>Levels:</strong> continue through an endless sequence of
          puzzles with varying difficulty.
        </li>
        <li>
          <strong>Daily Challenge:</strong> solve the day's puzzle and build
          your streak.
        </li>
        <li>
          <strong>Timed Challenge:</strong> clear the board before the countdown
          runs out, with three hearts.
        </li>
        <li>
          <strong>Friends:</strong> race another player to clear the same board.
        </li>
      </ul>
      <h2>Play with a friend</h2>
      <p>
        Open Friends, enter a nickname, and create a room. Share its
        six-character code and this website with your friend. The host chooses
        Easy, Medium, or Hard; the guest readies up, and the host starts the
        race. The first player to clear the puzzle wins. After the race, either
        player can request a rematch for the other to accept.
      </p>
      <h2>Controls and settings</h2>
      <p>
        Tap or click an arrow to move it. With a keyboard, use Tab to focus an
        arrow and Enter or Space to activate it. Settings let you adjust sound
        and reduced motion. Solo progress is saved in your browser; changing
        browser or clearing its storage resets that progress.
      </p>
      <Link href="/" className="guide-play">
        Play ArrowOut
      </Link>
    </main>
  );
}
