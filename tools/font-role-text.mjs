export function scriptStrings(source) {
  return [...source.matchAll(/'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"/g)].map(match => match[1] ?? match[2]);
}

export function dynamicHandStrings(filename, source) {
  if (filename === 'phone.js') {
    const hints = /function initHints\(\) \{[\s\S]*?(?=\n  var phones =)/.exec(source)?.[0];
    if (!hints) throw new Error('The handwritten phone mute labels must remain identifiable');
    return scriptStrings(hints);
  }
  if (filename === 'demos.js') {
    const hints = source.split('\n').filter(line => /NP\.swapText\(hint,/.test(line));
    if (!hints.length) throw new Error('The handwritten developer hints must remain identifiable');
    return hints.flatMap(scriptStrings);
  }
  return [];
}
