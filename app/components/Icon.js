import { HugeiconsIcon } from "@hugeicons/react";
import {
  HeartIcon,
  Copy01Icon,
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  PauseIcon,
  PlayIcon,
  RefreshCcwIcon,
  RefreshIcon,
  BulbIcon,
  Settings01Icon,
  Tick01Icon,
  GridIcon,
  SparklesIcon,
  StarIcon,
  LockIcon,
  Menu01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
export default function Icon({ name, ...props }) {
  const icons = {
    copy: Copy01Icon,
    back: ArrowLeft01Icon,
    pause: PauseIcon,
    play: PlayIcon,
    undo: RefreshCcwIcon,
    reset: RefreshIcon,
    hint: BulbIcon,
    settings: Settings01Icon,
    arrow: ArrowUpRight01Icon,
    check: Tick01Icon,
    grid: GridIcon,
    heart: HeartIcon,
    sparkles: SparklesIcon,
    star: StarIcon,
    lock: LockIcon,
    menu: Menu01Icon,
    close: Cancel01Icon,
  };
  return (
    <HugeiconsIcon
      icon={icons[name] || ArrowUpRight01Icon}
      size={24}
      color="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      {...props}
    />
  );
}
