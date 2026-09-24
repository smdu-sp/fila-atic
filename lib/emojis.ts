// Emojis offered by the picker, grouped. Plain characters, so nothing to load.
// KEYWORDS make the search box useful in Portuguese.

// Splits a string of emojis into one entry per emoji (grapheme), and asks for
// the colorful form of the old single-character symbols (❤ ⚠ ✔ ...) so they
// do not show up as black-and-white text glyphs.
const split = (text: string): string[] =>
  Array.from(new Intl.Segmenter().segment(text), ({ segment }) =>
    [...segment].length === 1 ? segment + "\uFE0F" : segment,
  );

export type EmojiGroup = {
  id: string;
  label: string;
  // the emoji that stands for the group on its tab
  icon: string;
  emojis: string[];
};

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "faces",
    label: "Rostos",
    icon: "😀",
    emojis: split("😀😃😄😁😆😅😂🤣🙂😉😊😇🥰😍🤩😘😋😛😜🤪😎🤓🧐🤔🤨😐😑😶🙄😏😴😌😔😪🤤😷🤒🤕🤢🥵🥶🥴😵🤯🥳😕😟🙁😮😲😳🥺😢😭😱😖😞😓😩😫😤😡🤬😈💀💩🤡👻👽🤖"),
  },
  {
    id: "gestures",
    label: "Gestos",
    icon: "👍",
    emojis: split("👍👎👌🤌✌🤞🤟🤘🤙👈👉👆👇☝👋🤚🖐✋👏🙌🤝🙏💪🫡🫶✍👀👁🧠🫂"),
  },
  {
    id: "work",
    label: "Trabalho",
    icon: "💻",
    emojis: split("💻🖥⌨🖱🖨📱☎📞📧📨📩📝📄📃📑📊📈📉📋📌📍📎🖇✂🗂📁📂🗃🗄🗑🔒🔓🔑🛠🔧🔨⚙🧰🔗💡🔍🔎📅📆🗓⏰⏳⌛🏷💼📦📮📢📣🔔🎯🏁🚀"),
  },
  {
    id: "status",
    label: "Status",
    icon: "✅",
    emojis: split("✅❌⭕✔✖❗❓⚠🚫⛔🔴🟠🟡🟢🔵🟣⚫⚪🟥🟧🟨🟩🟦🟪⬛⬜➕➖➡⬅⬆⬇🔄🔁⏩⏪⏸▶🆕🆗🆘🔥⭐🌟✨💥💬💭🏆🥇🎉🎊"),
  },
  {
    id: "hearts",
    label: "Símbolos",
    icon: "❤",
    emojis: split("❤🧡💛💚💙💜🖤🤍💔💕💯♻⚡☑☀🌙🔰"),
  },
  {
    id: "nature",
    label: "Natureza",
    icon: "🌱",
    emojis: split("🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦄🐝🐛🦋🐌🐞🐢🐍🐙🐬🐳🌱🌿🍀🌳🌴🌵🌸🌹🌻🍁🌈☁🌧⛈❄🌊"),
  },
  {
    id: "food",
    label: "Comida",
    icon: "🍕",
    emojis: split("🍎🍌🍇🍓🍉🍍🥑🍅🥕🌽🍞🧀🍔🍟🍕🌭🌮🍿🍩🍪🎂🍰🍫🍬☕🍵🥤🍺🍷"),
  },
  {
    id: "travel",
    label: "Lugares",
    icon: "🚗",
    emojis: split("🚗🚕🚌🚎🚲🏍🚂✈🚁🚢🏠🏢🏛🏥🏫🏭🌆🌇🗺🧭⛰🏖🏝"),
  },
];

// Portuguese search terms for the emojis people actually look for.
const KEYWORDS: Record<string, string> = {
  "👍": "joia ok certo positivo curtir",
  "👎": "negativo ruim",
  "✅": "feito pronto ok concluido check",
  "❌": "erro nao cancelado errado",
  "⚠": "atencao alerta cuidado",
  "🔥": "urgente fogo quente",
  "🚀": "lancamento deploy foguete",
  "💡": "ideia dica lampada",
  "🎉": "festa parabens comemorar",
  "🙏": "obrigado por favor",
  "👏": "palmas parabens",
  "😀": "feliz sorriso",
  "😂": "riso rindo",
  "😢": "triste choro",
  "😡": "raiva bravo",
  "🤔": "duvida pensando",
  "❤": "coracao amor",
  "⭐": "estrela favorito",
  "📌": "fixar importante alfinete",
  "📎": "anexo clipe",
  "📝": "nota anotacao escrever",
  "📊": "grafico relatorio",
  "📅": "data calendario prazo",
  "🔒": "seguranca trancado privado",
  "🔑": "chave senha acesso",
  "🛠": "ferramenta ajuste manutencao",
  "🐛": "bug erro inseto",
  "💻": "computador codigo notebook",
  "📧": "email correio",
  "⏰": "alarme hora prazo",
  "🏆": "trofeu conquista",
  "🎯": "meta alvo objetivo",
  "🔍": "buscar lupa pesquisa",
  "💬": "conversa comentario mensagem",
  "🚫": "proibido bloqueado",
  "🔄": "atualizar repetir sincronizar",
};

// Emojis whose group name or keywords contain the search text; nothing for an
// empty search.
export function searchEmojis(query: string): string[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];

  const found = new Set<string>();
  for (const group of EMOJI_GROUPS) {
    const groupMatches = group.label.toLowerCase().includes(text);
    for (const emoji of group.emojis) {
      if (groupMatches || (KEYWORDS[emoji.replace(/\uFE0F/g, "")] ?? "").includes(text)) {
        found.add(emoji);
      }
    }
  }
  return [...found];
}
