export type EmojiKey =
  | "fire"
  | "gem"
  | "rocket"
  | "money"
  | "up"
  | "down"
  | "chart"
  | "link"
  | "info"
  | "lightning"
  | "globe"
  | "warning"
  | "greenCircle"
  | "redCircle"
  | "lock"
  | "crown"
  | "party"
  | "boom"
  | "robot";

const CUSTOM_EMOJI: Record<EmojiKey, { id: string; char: string }> = {
  fire:        { id: "5424972470023104089", char: "🔥" },
  gem:         { id: "5427168083074628963", char: "💎" },
  rocket:      { id: "5330155504981253549", char: "🚀" },
  money:       { id: "5409048419211682843", char: "💵" },
  up:          { id: "5244837092042750681", char: "📈" },
  down:        { id: "5246762912428603768", char: "📉" },
  chart:       { id: "5231200819986047254", char: "📊" },
  link:        { id: "5271604874419647061", char: "🔗" },
  info:        { id: "5334544901428229844", char: "ℹ️" },
  lightning:   { id: "5456140674028019486", char: "⚡" },
  globe:       { id: "5447410659077661506", char: "🌐" },
  warning:     { id: "5447644880824181073", char: "⚠️" },
  greenCircle: { id: "5416081784641168838", char: "🟢" },
  redCircle:   { id: "5411225014148014586", char: "🔴" },
  lock:        { id: "5296369303661067030", char: "🔒" },
  crown:       { id: "5217822164362739968", char: "👑" },
  party:       { id: "5461151367559141950", char: "🎉" },
  boom:        { id: "5276032951342088188", char: "💥" },
  robot:       { id: "5357419403325481099", char: "🤖" },
};

export function e(key: EmojiKey): string {
  const { id, char } = CUSTOM_EMOJI[key];
  return `<tg-emoji emoji-id="${id}">${char}</tg-emoji>`;
}
