/* NeriPlayer site · dsp，布局按 AudioEffectsSettingsPage / Miuix 组件，对照模拟器截图校准 */
(function () {
  'use strict';

  var NP = window.NP;
  var M = NP.math;
  var $ = NP.$;
  var $$ = NP.$$;
  var L = NP.L;
  var P = NP.player;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var S = NP.sound.state;
  var pageId = 0;

  /* ---------- 文案：取自 strings_audio_effects.xml（values-zh / values-en） ---------- */
  var T = {
    title: L('音效与倍速', 'Audio Effects & Speed'),
    titleDesc: L('预设音效、均衡器、扬声器优化、声场与倍速', 'Sound presets, equalizer, speaker tuning, soundstage and speed'),
    master: L('启用音效', 'Enable sound effects'),
    masterDesc: L('开启后按下方设置处理声音；关闭时完全原声输出', 'Process audio with the settings below. When off, playback is left untouched.'),
    route: L('当前输出：浏览器默认', 'Output: Browser default'),
    active: L('浏览器音效已就绪', 'Browser effects ready'),
    activeRate: function (rate) { return L('浏览器正在处理 · ' + rate, 'Browser processing · ' + rate); },
    limited: function (db) { return L('网页限幅器压低峰值 ' + db, 'Web limiter reduced peaks by ' + db); },
    disabled: L('音效已关闭，试听原声', 'Effects are off · original sound'),
    neutral: L('当前音效设置与原声相同', 'The current effects match the original sound'),
    limIdle: L('防破音保护待命中', 'Clipping guard standing by'),
    limOff: L('防破音保护已关闭', 'Clipping guard is off'),
    tabs: [['presets', L('音效', 'Presets')], ['equalizer', L('均衡器', 'EQ')], ['tone', L('音色', 'Tone')], ['space', L('空间', 'Space')], ['dynamics', L('动态', 'Dynamics')], ['speaker', L('扬声器', 'Speaker')], ['speed', L('倍速', 'Speed')], ['advanced', L('高级', 'Advanced')]],
    secOn: { equalizer: L('启用均衡器', 'Enable equalizer'), tone: L('启用音色调节', 'Enable tone shaping'), space: L('启用空间效果', 'Enable spatial effects'), dynamics: L('启用动态处理', 'Enable dynamics'), speaker: L('启用外放优化', 'Enable speaker optimization'), speed: L('启用倍速与音调', 'Enable speed and pitch') },
    secDesc: L('关闭后这一分区按原声处理，已有的调节会保留', 'When off, this section plays as original. Your adjustments are kept.'),
    secDescDyn: L('关闭后压缩和输出增益按原声处理，仍保留默认的防破音保护', 'When off, compression and output gain play as original. The default clipping guard stays on.'),
    secDescSpeed: L('关闭后按正常速度播放，再次打开会恢复之前的倍速和音调', 'When off, playback runs at normal speed. Turning it back on restores your speed and pitch.'),
    reset: L('重置此分区', 'Reset this section'),
    presets: L('预设音效', 'Sound presets'),
    presetsDesc: L('一键切换适合不同音乐和场景的声音，选好后还能继续微调；耳机校正会被保留', 'One tap for a sound that suits the music or situation. You can keep fine-tuning afterwards, and headphone correction is kept.'),
    cats: [['style', L('风格', 'Genre')], ['tone', L('音色', 'Tone')], ['scene', L('场景', 'Scene')], ['device', L('设备', 'Device')], ['mine', L('我的', 'Mine')]],
    custom: L('当前：自定义', 'Current: Custom'),
    mineEmpty: L('还没有保存的音效。把声音调到满意后，点「保存为我的音效」', 'No saved sounds yet. When you like how it sounds, tap "Save as my sound".'),
    importCode: L('导入分享码', 'Import share code'),
    save: L('保存为我的音效', 'Save as my sound'),
    eq: L('均衡器', 'Equalizer'),
    eqDesc: L('上下拖动圆点调整各频段音量：左边是低音，中间是人声，右边是高音；双击圆点可以归零', 'Drag the dots up or down to change each range: bass on the left, vocals in the middle, treble on the right. Double-tap a dot to reset it.'),
    eqHint: L('按住圆点上下拖动即可调节；点选频段后可用下方按钮微调，或点数值直接输入', 'Drag a dot up or down to adjust it. Tap a band to fine-tune it with the buttons below, or tap the value to type it.'),
    preamp: L('整体音量（前级）', 'Overall level (preamp)'),
    preampDesc: L('均衡器提升太多出现破音时，在这里整体调低一点', 'If boosted bands start to distort, turn this down a little'),
    headroom: L('自动防破音余量', 'Automatic headroom'),
    headroomDesc: L('根据你的提升量自动预留空间，避免爆音，推荐开启', 'Leaves room for your boosts automatically to avoid clipping. Recommended.'),
    peq: L('耳机校正（参数均衡）', 'Headphone correction (parametric EQ)'),
    peqDesc: L('导入 AutoEq 等网站为你的耳机型号生成的曲线，让耳机声音更接近标准；切换风格预设时会保留', 'Import a curve made for your headphone model, for example from AutoEq, so it sounds closer to neutral. It is kept when you switch presets.'),
    peqOn: L('启用耳机校正', 'Enable headphone correction'),
    peqEmpty: L('还没有校正频段，可以导入 AutoEq 文本或手动添加', 'No correction bands yet. Import AutoEq text or add bands by hand.'),
    peqImport: L('导入 AutoEq 文本', 'Import AutoEq text'),
    peqHint: L('粘贴 ParametricEQ.txt 或 GraphicEQ 的内容', 'Paste the contents of ParametricEQ.txt or GraphicEQ'),
    peqAdd: L('添加频段', 'Add band'),
    peqClear: L('清空', 'Clear'),
    peqDone: function (n) { return L('已导入 ' + n + ' 个校正频段', 'Imported ' + n + ' correction bands'); },
    graphicDone: L('已导入十段均衡曲线', 'Imported the ten-band EQ curve'),
    peqEdit: L('编辑校正频段', 'Edit correction band'), peqEnabled: L('启用此频段', 'Enable this band'),
    frequency: L('频率 (Hz)', 'Frequency (Hz)'), gain: L('增益 (dB)', 'Gain (dB)'), remove: L('删除频段', 'Delete band'),
    peqFail: L('没有找到可用的滤波器，请检查粘贴的内容', 'No usable filters were found. Check the pasted text.'),
    ftype: { peak: L('峰值调节', 'Peak'), low_shelf: L('低频整体', 'Low shelf'), high_shelf: L('高频整体', 'High shelf'), low_pass: L('低通（去掉高频）', 'Low-pass (cut highs)'), high_pass: L('高通（去掉低频）', 'High-pass (cut lows)'), notch: L('陷波（去掉一个频率）', 'Notch (remove one frequency)'), band_pass: L('带通（只留一段）', 'Band-pass (keep one range)') },
    ok: L('确定', 'OK'), cancel: L('取消', 'Cancel'), off: L('关闭', 'Off'), auto: L('自动', 'Auto'),
    toneT: L('低音与高音', 'Bass & treble'), toneD: L('最简单的调音方式：想要更有力就加低音，想要更明亮就加高音', 'The simplest way to tune: add bass for punch, add treble for sparkle.'),
    bass: L('低音量感', 'Bass'), bassF: L('低音范围', 'Bass range'), bassFD: L('数值越低越偏向下潜的“轰”，越高越偏向鼓点的“咚”', 'Lower values target deep rumble, higher values target the kick drum'),
    treble: L('高音亮度', 'Treble'), trebleF: L('高音范围', 'Treble range'),
    vb: L('虚拟低音', 'Virtual bass'), vbD: L('用谐波让耳朵“脑补”出低音，小耳机和手机外放也能听出下潜', 'Uses harmonics so your ear hears deep bass even on small earbuds or the phone speaker'), vbF: L('虚拟低音频率', 'Virtual bass frequency'),
    colorT: L('音色润色', 'Sound character'), colorD: L('给声音加一点“味道”，少量使用效果最好', 'Adds a bit of flavor. A little goes a long way.'),
    warmth: L('温暖度', 'Warmth'), warmthD: L('模拟电子管和黑胶的柔和厚实感，减少刺耳', 'Tube and vinyl style warmth that softens harshness'),
    clarity: L('清晰度', 'Clarity'), clarityD: L('补回压缩音质丢失的细节和空气感', 'Brings back detail and air lost to compression'), clarityF: L('清晰度范围', 'Clarity range'),
    vocal: L('人声突出', 'Vocal focus'), vocalD: L('只加强位于中间的人声，伴奏保持不变', 'Lifts the centered vocals and leaves the backing alone'),
    vr: L('消除人声（伴奏模式）', 'Remove vocals (karaoke)'), vrD: L('削弱中间的人声方便跟唱，不同歌曲效果有差异', 'Reduces centered vocals so you can sing along. Results vary by song.'),
    spaceT: L('声场与空间', 'Soundstage & space'), spaceD: L('改变声音的宽度和距离感', 'Changes how wide and how far away the sound feels'),
    width: L('立体声宽度', 'Stereo width'), widthD: L('100% 为原始宽度，0% 为单声道，更高会更宽', '100% is the original width, 0% is mono, higher is wider'),
    surround: L('3D 环绕', '3D surround'), surroundD: L('让声音延伸到头部以外，更有包围感', 'Spreads the sound beyond your head for an enveloping feel'),
    crossfeed: L('耳机交叉馈送', 'Headphone crossfeed'), crossfeedD: L('让耳机听起来像面前的音箱，长时间听更不累', 'Makes headphones sound more like speakers in front of you, less tiring over time'),
    reverb: L('混响', 'Reverb'), reverbD: L('加入房间回声，数值越大越像身处大厅', 'Adds room echo. Higher sounds like a bigger hall.'),
    reverbRoom: L('房间大小', 'Room size'), reverbBright: L('回声明亮度', 'Echo brightness'), reverbDelay: L('回声延迟', 'Echo delay'),
    monoBass: L('低频居中', 'Centered bass'), monoBassD: L('把这个频率以下的低音合到中间，低音更集中有力', 'Merges bass below this frequency into the center for tighter, stronger bass'),
    mono: L('单声道', 'Mono'), monoD: L('只戴一只耳机或只有一个扬声器时使用', 'For listening with one earbud or a single speaker'), swap: L('左右声道互换', 'Swap left and right'),
    dynT: L('音量与动态', 'Loudness & dynamics'), dynD: L('让音量更均匀，并防止破音', 'Evens out the volume and prevents clipping'),
    comp: L('动态压缩', 'Dynamic compression'), compD: L('让小声更清楚、大声不刺耳，适合夜间、通勤和嘈杂环境', 'Quiet parts get clearer and loud parts gentler. Great at night, on the go or in noisy places.'),
    outGain: L('额外音量', 'Extra volume'), outGainD: L('声音太小时可以加一点，防破音会自动保护', 'Add a little if it is too quiet. The clipping guard keeps you safe.'),
    limiter: L('防破音（限幅器）', 'Clipping guard (limiter)'), limiterD: L('峰值超过上限时自动压低，避免爆音', 'Pulls peaks down automatically to avoid distortion'),
    ceiling: L('峰值上限', 'Peak ceiling'), release: L('恢复时间', 'Recovery time'),
    compAdv: L('显示专业参数', 'Show advanced parameters'),
    compThr: L('开始压缩的音量（阈值）', 'Level where compression starts (threshold)'), compRatio: L('压缩强度（比率）', 'Strength (ratio)'),
    compAttack: L('反应速度（启动）', 'Reaction speed (attack)'), compRelease: L('恢复速度（释放）', 'Recovery speed (release)'),
    compKnee: L('过渡柔和度（拐点）', 'Smoothness (knee)'), compMakeup: L('补回音量', 'Make-up gain'),
    spkMasterOff: L('音效总开关已关闭，优化暂不生效', 'Audio effects are turned off, so this is paused'),
    spkT: L('扬声器优化', 'Speaker optimization'), spkD: L('只在手机自带扬声器外放时生效，插上耳机或连接蓝牙会自动停用', 'Only works on the built-in speaker. It turns off automatically with headphones or Bluetooth.'),
    spkSize: L('扬声器类型', 'Speaker type'), spkSizes: [['phone', L('手机', 'Phone')], ['tablet', L('平板', 'Tablet')], ['large', L('大音箱', 'Large speaker')]],
    spkBass: L('低音补偿', 'Bass enhancement'), spkBassD: L('用谐波补回小喇叭发不出的低音', 'Rebuilds bass that tiny speakers cannot play, using harmonics'),
    spkLoud: L('响亮度', 'Loudness'), spkLoudD: L('分频段压缩，声音更大更饱满且不容易破音', 'Multiband compression for a louder, fuller sound without distortion'),
    spkClarity: L('清晰度', 'Clarity'), spkExpand: L('立体声扩展', 'Stereo expansion'),
    spkProt: L('低频保护', 'Low-frequency protection'), spkProtD: L('滤掉扬声器发不出的超低频，减少破音和振动杂音', 'Filters out deep bass the speaker cannot reproduce, reducing distortion and rattling'),
    speedT: L('倍速与音调', 'Speed & pitch'), speedD: L('改变播放速度和音高，两者可以分开调节', 'Change playback speed and pitch independently'),
    speed: L('播放速度', 'Speed'), pitch: L('音调', 'Pitch'),
    semis: function (v) { return L(v + ' 个半音', v + ' semitones'); },
    linked: L('变调跟随倍速（唱片效果）', 'Pitch follows speed (vinyl style)'), linkedD: L('开启后加速声音会变尖、减速会变低沉，适合 Nightcore', 'Speeding up raises the pitch and slowing down lowers it, Nightcore style'),
    linkedNote: L('音调会随倍速一起变化，就像唱片转快或转慢；关闭后可单独调节音调', 'Pitch moves with speed, like a turntable running faster or slower. Turn this off to set pitch separately.'),
    advT: L('高级与功耗', 'Advanced & power'), advD: L('音效全部关闭或等于原声时会自动跳过处理，系统可以改用硬件解码，最省电', 'When effects are off or match the original sound, processing is skipped. The system can use hardware decoding to save the most power.'),
    mode: L('处理模式', 'Processing mode'), modes: [['eco', L('省电', 'Power saver')], ['balanced', L('均衡', 'Balanced')], ['high', L('高音质', 'High quality')]],
    modeD: { eco: L('混响和压缩使用简化算法，不加抖动，适合长时间外出', 'Lighter reverb and compression, no dither. Good for long days out.'), balanced: L('音质和耗电平衡，推荐使用', 'A recommended balance of quality and battery'), high: L('参数变化更细腻，16 位输出使用降噪整形抖动，耗电略高', 'Finer parameter changes and noise-shaped dither on 16-bit output. Uses slightly more battery.') },
    perOut: L('按设备分别保存', 'Separate sound per device'), perOutD: L('扬声器、有线耳机、蓝牙和 USB 各记住一套音效，切换设备时自动更换', 'Speaker, wired, Bluetooth and USB each keep their own sound and switch automatically'),
    usb: L('USB 独占时也使用音效', 'Use effects in USB exclusive mode'), usbD: L('默认关闭以保持比特完美；开启「比特完美输出」时仍会跳过', 'Off by default to stay bit-perfect. Still skipped while bit-perfect output is on.'),
    resetAll: L('重置当前音效', 'Reset current sound'),
    back: L('返回', 'Back'), na: function (w) { return L('网页演示里没有接入「' + w + '」', '“' + w + '” isn’t wired up in this web demo'); },
    hint: L('按下播放键出声，就能听到效果', 'Press play to hear the change'),
  };

  /* ---------- 格式（AudioEffectsPresentation.kt） ---------- */
  function fDb(v) { var r = Math.round(v * 10) / 10; return r > 0 ? '+' + r.toFixed(1) + ' dB' : r < 0 ? r.toFixed(1) + ' dB' : '0 dB'; }
  function fPct(v) { return Math.round(v * 100) + '%'; }
  function fHz(hz) { if (hz >= 1000) { var k = hz / 1000; return Math.abs(k - Math.round(k)) < 0.05 ? Math.round(k) + ' kHz' : k.toFixed(1) + ' kHz'; } return Math.round(hz) + ' Hz'; }
  function fX(v) { return v.toFixed(2) + 'x'; }
  function fSemi(v) { var r = Math.round(v * 10) / 10; return r > 0 ? '+' + r.toFixed(1) : r.toFixed(1); }
  function fMs(v) { return v < 10 ? v.toFixed(1) + ' ms' : Math.round(v) + ' ms'; }
  function fRatio(v) { return v.toFixed(1) + ':1'; }
  function fKnee(v) { return (Math.round(v * 10) / 10).toFixed(1) + ' dB'; }
  function semis(pitch) { return Math.round(12 * Math.log(pitch) / Math.LN2 * 2) / 2; }

  /* 滑块：key → [取值, 写入, 范围, 步进, 格式, 所在分区] */
  var local = { tab: 'presets', cat: 0, band: 5, drag: -1, mode: 'balanced', perOut: false, usb: false, compAdv: false };
  function sv(k) { return function () { return S[k]; }; }
  function ss(k) { return function (v) { S[k] = v; custom(); }; }
  /* 扬声器优化不属于音色预设（SpeakerOptimizerSettings 单独保存），调它不会把预设变成「自定义」 */
  function spk(k) { return function (v) { S[k] = v; }; }
  var SL = {
    preamp: [sv('preamp'), ss('preamp'), [-12, 6], 0.5, fDb, 'equalizer'],
    bass: [sv('bass'), ss('bass'), [-12, 12], 0.5, fDb, 'tone'],
    bassFreq: [sv('bassFreq'), ss('bassFreq'), [40, 250], 5, fHz, 'tone'],
    treble: [sv('treble'), ss('treble'), [-12, 12], 0.5, fDb, 'tone'],
    trebleFreq: [sv('trebleFreq'), ss('trebleFreq'), [2000, 14000], 250, fHz, 'tone'],
    virtualBass: [sv('virtualBass'), ss('virtualBass'), [0, 1], 0.05, fPct, 'tone'],
    vbFreq: [sv('vbFreq'), ss('vbFreq'), [50, 200], 5, fHz, 'tone'],
    warmth: [sv('warmth'), ss('warmth'), [0, 1], 0.05, fPct, 'tone'],
    clarity: [sv('clarity'), ss('clarity'), [0, 1], 0.05, fPct, 'tone'],
    clarityFreq: [sv('clarityFreq'), ss('clarityFreq'), [2000, 10000], 250, fHz, 'tone'],
    vocal: [sv('vocal'), ss('vocal'), [0, 1], 0.05, fPct, 'tone'],
    vocalRemoval: [sv('vocalRemoval'), ss('vocalRemoval'), [0, 1], 0.05, fPct, 'tone'],
    width: [sv('width'), ss('width'), [0, 2], 0.05, fPct, 'space'],
    surround: [sv('surround'), ss('surround'), [0, 1], 0.05, fPct, 'space'],
    crossfeed: [sv('crossfeed'), ss('crossfeed'), [0, 1], 0.05, fPct, 'space'],
    reverb: [sv('reverb'), ss('reverb'), [0, 1], 0.05, fPct, 'space'],
    reverbRoom: [sv('reverbRoom'), ss('reverbRoom'), [0, 1], 0.05, fPct, 'space'],
    reverbBright: [function () { return 1 - S.reverbDamping; }, function (v) { S.reverbDamping = 1 - v; custom(); }, [0, 1], 0.05, fPct, 'space'],
    reverbPreDelay: [sv('reverbPreDelay'), ss('reverbPreDelay'), [0, 100], 1, fMs, 'space'],
    monoBass: [sv('monoBass'), function (v) { S.monoBass = v < 40 ? 0 : v; custom(); }, [0, 250], 10, function (v) { return v < 40 ? T.off : fHz(v); }, 'space'],
    comp: [function () { return NP.sound.compAmount(); }, function (v) { NP.sound.setCompAmount(v); custom(); }, [0, 1], 0.05, fPct, 'dynamics'],
    compThr: [sv('compThr'), ss('compThr'), [-50, 0], 0.5, fDb, 'dynamics'],
    compRatio: [sv('compRatio'), ss('compRatio'), [1, 20], 0.1, fRatio, 'dynamics'],
    compAttack: [sv('compAttack'), ss('compAttack'), [0.5, 100], 0.5, fMs, 'dynamics'],
    compRelease: [sv('compRelease'), ss('compRelease'), [20, 1000], 10, fMs, 'dynamics'],
    compKnee: [sv('compKnee'), ss('compKnee'), [0, 18], 0.5, fKnee, 'dynamics'],
    compMakeup: [sv('compMakeup'), ss('compMakeup'), [0, 18], 0.5, fDb, 'dynamics'],
    outGain: [sv('outGain'), ss('outGain'), [-12, 12], 0.5, fDb, 'dynamics'],
    ceiling: [sv('ceiling'), ss('ceiling'), [-6, 0], 0.1, fDb, 'dynamics'],
    release: [sv('release'), ss('release'), [20, 500], 10, fMs, 'dynamics'],
    spkBass: [sv('spkBass'), spk('spkBass'), [0, 1], 0.05, fPct, 'speaker'],
    spkLoud: [sv('spkLoud'), spk('spkLoud'), [0, 1], 0.05, fPct, 'speaker'],
    spkClarity: [sv('spkClarity'), spk('spkClarity'), [0, 1], 0.05, fPct, 'speaker'],
    spkExpand: [sv('spkExpand'), spk('spkExpand'), [0, 1], 0.05, fPct, 'speaker'],
    spkProt: [sv('spkProt'), function (v) { S.spkProt = v < 40 ? 0 : v; }, [0, 400], 10, function (v) { return v < 40 ? T.auto + ' · ' + fHz(NP.sound.spkSizes[S.spkSize]) : fHz(v); }, 'speaker'],
    speed: [function () { return P.speed; }, function (v) { P.setSpeed(v); if (S.linked) P.setPitch(M.clamp(v, 0.25, 2)); }, [0.25, 3], 0.05, fX, 'speed'],
    pitch: [function () { return semis(P.pitch); }, function (v) { P.setPitch(Math.pow(2, v / 12)); }, [-12, 12], 0.5, function (v) { return T.semis(fSemi(v)); }, 'speed'],
  };
  function custom() { S.preset = 'custom'; S.on = true; }

  /* ---------- 标记 ---------- */
  function ic(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function li(key, title, desc) {
    return '<div class="fxa-li" data-sw="' + key + '"><div class="fxa-li__t"><b>' + title + '</b>' + (desc ? '<span data-sw-desc>' + desc + '</span>' : '') + '</div><span class="m3switch" role="switch" tabindex="0" aria-label="' + title + '"><i></i></span></div>';
  }
  function intro(t, d) { return '<div class="fxa-intro"><b>' + t + '</b><span>' + d + '</span></div>'; }
  function note(t, attr) { return '<p class="fxa-note"' + (attr || '') + '>' + t + '</p>'; }
  function slider(key, title, desc) {
    var spec = SL[key];
    return '<div class="fxa-sl" data-sl="' + key + '"><div class="fxa-sl__row"><b>' + title + '</b><button type="button" class="fxa-chipv" data-v aria-label="' + title + '"></button></div>' + (desc ? '<span class="fxa-sl__d">' + desc + '</span>' : '') +
      '<div class="xslider fxa-xs"><i class="xs-on"></i><i class="xs-thumb"></i><i class="xs-off"></i><input type="range" min="' + spec[2][0] + '" max="' + spec[2][1] + '" step="' + spec[3] + '" aria-label="' + title + '"></div></div>';
  }
  function seg(key, items) {
    return '<div class="fxa-seg" data-seg="' + key + '" role="radiogroup" aria-label="' + (key === 'mode' ? T.mode : key === 'spkSize' ? T.spkSize : T.presets) + '"><i class="fxa-seg__ind" aria-hidden="true"></i>' + items.map(function (it, i) { return '<button type="button" role="radio" data-i="' + i + '" data-v="' + it[0] + '">' + it[1] + '</button>'; }).join('') + '</div>';
  }
  function when(cond, inner) { return '<div class="fxa-when" data-when="' + cond + '"><div class="fxa-when__in">' + inner + '</div></div>'; }
  function card(inner, sec) { return '<div class="fxa-card"' + (sec ? ' data-sec="' + sec + '"' : '') + '>' + inner + '</div>'; }
  function quick(key, values, fmt) { return '<div class="fxa-quick" data-quick="' + key + '">' + values.map(function (v) { return '<span class="fxa-chipw"><button type="button" class="fxa-chip" data-q="' + v + '">' + fmt(v) + '</button></span>'; }).join('') + '</div>'; }
  function btn(label, attr) { return '<button type="button" class="fxa-obtn"' + (attr || '') + '>' + label + '</button>'; }
  function resetBtn(sec) { return '<div class="fxa-reset"><button type="button" class="fxa-glass" data-reset="' + sec + '">' + ic('i-restart') + '<span>' + T.reset + '</span></button></div>'; }
  function secSwitch(sec) {
    var d = sec === 'dynamics' ? T.secDescDyn : sec === 'speed' ? T.secDescSpeed : T.secDesc;
    return card(li('sec.' + sec, T.secOn[sec], d));
  }

  var BANDS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
  var FREQS = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  function panes() {
    return {
      presets: card(intro(T.presets, T.presetsDesc) + '<div class="fxa-segwrap">' + seg('cat', T.cats) + '</div><div class="fxa-flow" data-presets></div>' + note(T.custom, ' data-custom') +
        '<div class="fxa-btns">' + btn(T.importCode, ' data-na="' + T.importCode + '"') + btn(T.save, ' data-na="' + T.save + '"') + '</div>'),
      equalizer: secSwitch('equalizer') +
        card(intro(T.eq, T.eqDesc) + '<div class="fxa-graph" data-graph></div>' +
          '<div class="fxa-band"><button type="button" class="pbtn" data-band="-1" aria-label="' + L('上一个频段', 'Previous band') + '">' + ic('i-chev-l') + '</button><b data-band-name></b><button type="button" class="pbtn" data-band="1" aria-label="' + L('下一个频段', 'Next band') + '">' + ic('i-chev-r') + '</button><i></i>' +
          '<button type="button" class="pbtn" data-step="-0.5" aria-label="' + L('降低 0.5 dB', 'Lower by 0.5 dB') + '">' + ic('i-minus') + '</button><button type="button" class="fxa-chipv fxa-chipv--btn" data-band-val aria-label="' + L('输入频段增益', 'Enter band gain') + '"></button><button type="button" class="pbtn" data-step="0.5" aria-label="' + L('提高 0.5 dB', 'Raise by 0.5 dB') + '">' + ic('i-plus') + '</button></div>' +
          note(T.eqHint) + slider('preamp', T.preamp, T.preampDesc) + li('autoHeadroom', T.headroom, T.headroomDesc), 'equalizer') +
        card(intro(T.peq, T.peqDesc) + li('peqOn', T.peqOn) + '<div data-peq></div>' +
          '<div class="fxa-btns fxa-btns--start">' + btn(T.peqImport, ' data-peq-import') + btn(T.peqAdd, ' data-peq-add') + btn(T.peqClear, ' data-peq-clear') + '</div>', 'equalizer') + resetBtn('equalizer'),
      tone: secSwitch('tone') +
        card(intro(T.toneT, T.toneD) + slider('bass', T.bass) + slider('bassFreq', T.bassF, T.bassFD) + slider('treble', T.treble) + slider('trebleFreq', T.trebleF) + slider('virtualBass', T.vb, T.vbD) + when('virtualBass', slider('vbFreq', T.vbF)), 'tone') +
        card(intro(T.colorT, T.colorD) + slider('warmth', T.warmth, T.warmthD) + slider('clarity', T.clarity, T.clarityD) + when('clarity', slider('clarityFreq', T.clarityF)) + slider('vocal', T.vocal, T.vocalD) + slider('vocalRemoval', T.vr, T.vrD), 'tone') + resetBtn('tone'),
      space: secSwitch('space') +
        card(intro(T.spaceT, T.spaceD) + slider('width', T.width, T.widthD) + slider('surround', T.surround, T.surroundD) + slider('crossfeed', T.crossfeed, T.crossfeedD) + slider('reverb', T.reverb, T.reverbD) +
          when('reverb', slider('reverbRoom', T.reverbRoom) + slider('reverbBright', T.reverbBright) + slider('reverbPreDelay', T.reverbDelay)) +
          slider('monoBass', T.monoBass, T.monoBassD) + li('mono', T.mono, T.monoD) + li('swap', T.swap), 'space') + resetBtn('space'),
      dynamics: secSwitch('dynamics') +
        card(intro(T.dynT, T.dynD) + slider('comp', T.comp, T.compD) + when('compOn', li('compAdv', T.compAdv)) +
          when('compOn&compAdv', slider('compThr', T.compThr) + slider('compRatio', T.compRatio) + slider('compAttack', T.compAttack) + slider('compRelease', T.compRelease) + slider('compKnee', T.compKnee) + slider('compMakeup', T.compMakeup)) +
          slider('outGain', T.outGain, T.outGainD) + li('limiter', T.limiter, T.limiterD) + when('limiter', slider('ceiling', T.ceiling) + slider('release', T.release)), 'dynamics') + resetBtn('dynamics'),
      speaker: secSwitch('speaker') +
        card(intro(T.spkT, T.spkD) + note(T.spkSize) + '<div class="fxa-segwrap">' + seg('spkSize', T.spkSizes) + '</div>' + slider('spkBass', T.spkBass, T.spkBassD) + slider('spkLoud', T.spkLoud, T.spkLoudD) + slider('spkClarity', T.spkClarity) + slider('spkExpand', T.spkExpand) + slider('spkProt', T.spkProt, T.spkProtD), 'speaker') + resetBtn('speaker'),
      speed: secSwitch('speed') +
        card(intro(T.speedT, T.speedD) + slider('speed', T.speed) + quick('speed', [0.5, 0.75, 0.85, 0.95, 1, 1.05, 1.1, 1.25, 1.5, 2], fX) + slider('pitch', T.pitch) + when('!linked', quick('pitch', [-3, -1, 0, 1, 3], fSemi)) + li('linked', T.linked, T.linkedD) + when('linked', note(T.linkedNote)), 'speed') + resetBtn('speed'),
      advanced: card(intro(T.advT, T.advD) + note(T.mode) + '<div class="fxa-segwrap">' + seg('mode', T.modes) + '</div>' + note('', ' data-mode-desc') + li('perOut', T.perOut, T.perOutD) + li('usb', T.usb, T.usbD) + '<div class="fxa-btns">' + btn(T.resetAll, ' data-reset-all') + '</div>'),
    };
  }

  function markup(id) {
    var p = panes();
    return '<div class="fxa-bar"><button type="button" class="pbtn" data-back aria-label="' + T.back + '">' + ic('i-back') + '</button><b class="fxa-bar__t" aria-hidden="true">' + T.title + '</b></div>' +
      '<div class="fxa-scroll" data-scroll><h3 class="fxa-large">' + T.title + '</h3><div class="fxa-list">' +
      card(li('on', T.master, T.masterDesc) + note(T.route) + '<p class="fxa-status" data-status></p><p class="fxa-lim" data-lim></p>') +
      '<div class="fxa-tabs"><div class="fxa-tabs__row" role="tablist" aria-label="' + T.title + '" data-tabs>' + T.tabs.map(function (t) { return '<button type="button" role="tab" id="' + id + '-tab-' + t[0] + '" aria-controls="' + id + '-pane-' + t[0] + '" data-tab="' + t[0] + '"><span>' + t[1] + '<i class="fxa-dot" aria-hidden="true"></i></span></button>'; }).join('') + '<i class="fxa-ind" aria-hidden="true"></i></div></div>' +
      '<div class="fxa-panes">' + T.tabs.map(function (t) { return '<div class="fxa-pane" role="tabpanel" id="' + id + '-pane-' + t[0] + '" aria-labelledby="' + id + '-tab-' + t[0] + '" data-pane="' + t[0] + '">' + p[t[0]] + '</div>'; }).join('') + '</div>' +
      '</div></div>' +
      '<div class="fxa-dlg" data-dlg hidden><div class="fxa-dlg__card" role="dialog" aria-modal="true" aria-label="' + T.peqImport + '"><b>' + T.peqImport + '</b><textarea spellcheck="false" aria-label="' + T.peqHint + '" placeholder="' + T.peqHint + '"></textarea><div class="fxa-dlg__btns"><button type="button" data-dlg-cancel>' + T.cancel + '</button><button type="button" data-dlg-ok>' + T.ok + '</button></div></div></div>' +
      '<div class="fxa-dlg" data-edit-dlg hidden><div class="fxa-dlg__card" role="dialog" aria-modal="true"><b data-edit-title></b><div data-edit-body></div><div class="fxa-dlg__btns"><button type="button" data-peq-delete>' + T.remove + '</button><button type="button" data-edit-cancel>' + T.cancel + '</button><button type="button" data-peq-save>' + T.ok + '</button></div></div></div>';
  }

  /* ---------- 频响（与桌面版 / App 的 responseCurve 同一套 RBJ 双二阶） ---------- */
  function biquad(type, f, gain, q) {
    var w = 2 * Math.PI * Math.min(f, 23900) / 48000;
    var c = Math.cos(w);
    var alpha = Math.sin(w) / (2 * Math.max(0.1, Math.min(24, q)));
    var a = Math.pow(10, gain / 40);
    var root = 2 * Math.sqrt(a) * alpha;
    var k;
    switch (type) {
      case 'low_shelf': k = [a * (a + 1 - (a - 1) * c + root), 2 * a * (a - 1 - (a + 1) * c), a * (a + 1 - (a - 1) * c - root), a + 1 + (a - 1) * c + root, -2 * (a - 1 + (a + 1) * c), a + 1 + (a - 1) * c - root]; break;
      case 'high_shelf': k = [a * (a + 1 + (a - 1) * c + root), -2 * a * (a - 1 + (a + 1) * c), a * (a + 1 + (a - 1) * c - root), a + 1 - (a - 1) * c + root, 2 * (a - 1 - (a + 1) * c), a + 1 - (a - 1) * c - root]; break;
      case 'low_pass': k = [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha]; break;
      case 'high_pass': k = [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha]; break;
      case 'notch': k = [1, -2 * c, 1, 1 + alpha, -2 * c, 1 - alpha]; break;
      case 'band_pass': k = [alpha, 0, -alpha, 1 + alpha, -2 * c, 1 - alpha]; break;
      default: k = [1 + alpha * a, -2 * c, 1 - alpha * a, 1 + alpha / a, -2 * c, 1 - alpha / a];
    }
    return [k[0] / k[3], k[1] / k[3], k[2] / k[3], k[4] / k[3], k[5] / k[3]];
  }
  function mag(b, hz) {
    var w = 2 * Math.PI * hz / 48000;
    var c1 = Math.cos(w), c2 = Math.cos(2 * w), s1 = Math.sin(w), s2 = Math.sin(2 * w);
    var rn = b[0] + b[1] * c1 + b[2] * c2, inn = -b[1] * s1 - b[2] * s2;
    var rd = 1 + b[3] * c1 + b[4] * c2, idd = -b[3] * s1 - b[4] * s2;
    var n = rn * rn + inn * inn, d = rd * rd + idd * idd;
    return n <= 0 || d <= 0 ? -120 : 10 * Math.log10(n / d);
  }
  function response(st, forceEq) {
    var fs = [];
    var eqOn = forceEq || (st.on && st.sec.equalizer);
    if (eqOn) st.eq.forEach(function (g, i) { if (g) fs.push(biquad('peak', FREQS[i], g, 1.41)); });
    if (eqOn && st.peqOn) st.peq.forEach(function (b) { if (b.on !== false) fs.push(biquad(b.type, b.f, b.g, b.q)); });
    if ((forceEq || st.on) && st.sec.tone && st.bass) fs.push(biquad('low_shelf', st.bassFreq, st.bass, 0.707));
    if ((forceEq || st.on) && st.sec.tone && st.treble) fs.push(biquad('high_shelf', st.trebleFreq, st.treble, 0.707));
    var pre = eqOn ? st.preamp : 0;
    var out = [];
    for (var i = 0; i < 96; i++) {
      var hz = 20 * Math.pow(1000, i / 95);
      var g = pre;
      for (var j = 0; j < fs.length; j++) g += mag(fs[j], hz);
      out.push([hz, g]);
    }
    return out;
  }
  NP.dspResponse = response;

  /* ---------- 均衡曲线（AudioEffectsEqualizerGraph：220dp 高、左 30 / 上 18 / 下 22） ---------- */
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function innerW(box) {
    var cs = getComputedStyle(box);
    return box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }
  function Graph(box, ui) {
    var W = innerW(box) || 343;
    var H = 220;
    this.W = W;
    var left = 30, top = 18, bottom = 22;
    var cell = (W - left) / 10;
    var plotH = H - top - bottom;
    this.bx = function (i) { return left + (i + 0.5) * cell; };
    this.fx = function (hz) { return M.clamp(left + (Math.log(hz / 31.25) / Math.LN2 + 0.5) * cell, left, W); };
    this.dy = function (db) { return top + (12 - M.clamp(db, -12, 12)) / 24 * plotH; };
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'fxg', role: 'img', 'aria-label': T.eq });
    var defs = svg('defs', {}, s);
    var lg = svg('linearGradient', { id: 'fxgFill' + (Graph.n = (Graph.n || 0) + 1), x1: 0, y1: 0, x2: 0, y2: (top + plotH) / H, gradientUnits: 'objectBoundingBox' }, defs);
    svg('stop', { offset: 0, 'stop-color': '#d2bcfd', 'stop-opacity': 0.28 }, lg);
    svg('stop', { offset: 1, 'stop-color': '#d2bcfd', 'stop-opacity': 0.04 }, lg);
    var self = this;
    [12, 6, 0, -6, -12].forEach(function (db) {
      var y = self.dy(db);
      svg('line', { x1: left, x2: W, y1: y, y2: y, class: db === 0 ? 'fxg__zero' : 'fxg__grid' }, s);
      var t = svg('text', { x: left / 2, y: y, class: 'fxg__t' }, s);
      t.textContent = db > 0 ? '+' + db : String(db);
    });
    BANDS.forEach(function (b, i) { var t = svg('text', { x: self.bx(i), y: H - 8, class: 'fxg__t' }, s); t.textContent = b; });
    this.col = svg('line', { y1: top, y2: top + plotH, class: 'fxg__col' }, s);
    this.area = svg('path', { class: 'fxg__area', fill: 'url(#' + lg.id + ')' }, s);
    this.line = svg('path', { class: 'fxg__line' }, s);
    this.dots = FREQS.map(function () { return svg('circle', { r: 8, class: 'fxg__dot' }, s); });
    this.tip = svg('text', { class: 'fxg__tip' }, s);
    box.appendChild(s);
    this.svg = s;
    /* 只有按在圆点附近才算抓住它（半径 22dp、纵向 1.6 倍），否则松手时选中最近的频段 */
    var drag = null;
    var toLocal = function (e) { var r = s.getBoundingClientRect(); var k = r.width / W; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };
    s.addEventListener('pointerdown', function (e) {
      if (!secActive('equalizer')) return;
      var p = toLocal(e);
      var band = M.clamp(Math.floor((p.x - left) / cell), 0, 9);
      var hit = Math.abs(p.x - self.bx(band)) <= 22 && Math.abs(p.y - self.dy(S.eq[band])) <= 22 * 1.6;
      local.band = band;
      if (hit) { drag = { band: band, y0: p.y, g0: S.eq[band] }; local.drag = band; NP.capture(s, e); e.preventDefault(); }
      ui.paint();
    });
    s.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = toLocal(e);
      var g = drag.g0 + (drag.y0 - p.y) / plotH * 24;
      S.eq[drag.band] = M.clamp(Math.round(g * 2) / 2, -12, 12);
      S.sec.equalizer = true;
      custom();
      ui.changed();
    });
    var up = function () { if (!drag) return; drag = null; local.drag = -1; ui.paint(); };
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);
    s.addEventListener('dblclick', function (e) {
      if (!secActive('equalizer')) return;
      var p = toLocal(e);
      var band = M.clamp(Math.floor((p.x - left) / cell), 0, 9);
      S.eq[band] = 0;
      custom();
      ui.changed();
    });
  }
  Graph.prototype.paint = function () {
    var self = this;
    var on = S.on && S.sec.equalizer;
    var cur = response(Object.assign({}, S, { sec: Object.assign({}, S.sec, { equalizer: true }) }), true);
    var d = '';
    var fill = '';
    cur.forEach(function (p, i) {
      var x = self.fx(p[0]).toFixed(1), y = self.dy(p[1]).toFixed(1);
      d += (i ? 'L' : 'M') + x + ' ' + y + ' ';
      fill += (i ? 'L' : 'M' + x + ' ' + self.dy(0).toFixed(1) + ' L') + x + ' ' + y + ' ';
    });
    fill += 'L' + self.fx(cur[cur.length - 1][0]).toFixed(1) + ' ' + self.dy(0).toFixed(1) + ' Z';
    this.line.setAttribute('d', d);
    this.area.setAttribute('d', fill);
    this.svg.classList.toggle('is-off', !on);
    var bx = this.bx(local.band);
    this.col.setAttribute('x1', bx);
    this.col.setAttribute('x2', bx);
    this.dots.forEach(function (c, i) {
      var active = i === local.drag;
      var sel = i === local.band;
      c.setAttribute('cx', self.bx(i));
      c.setAttribute('cy', self.dy(S.eq[i]));
      c.setAttribute('r', active ? 11 : 8);
      c.classList.toggle('is-sel', sel);
    });
    var r = local.drag === local.band ? 11 : 8;
    this.tip.setAttribute('x', bx);
    this.tip.setAttribute('y', this.dy(S.eq[local.band]) - r - 14);
    this.tip.textContent = fDb(S.eq[local.band]);
  };

  /* ---------- AutoEq 文本（ParametricEQ.txt：Filter n: ON PK Fc 105 Hz Gain -2.3 dB Q 0.70） ---------- */
  var AUTOEQ_SAMPLE = 'Preamp: -5.8 dB\nFilter 1: ON LSC Fc 105 Hz Gain 5.6 dB Q 0.70\nFilter 2: ON PK Fc 160 Hz Gain -3.2 dB Q 0.64\nFilter 3: ON PK Fc 1250 Hz Gain 1.9 dB Q 1.42\nFilter 4: ON PK Fc 3100 Hz Gain -2.6 dB Q 2.10\nFilter 5: ON PK Fc 5600 Hz Gain 3.1 dB Q 3.40\nFilter 6: ON HSC Fc 10000 Hz Gain -1.8 dB Q 0.70';
  var AE_TYPES = { PK: 'peak', PEQ: 'peak', LSC: 'low_shelf', LS: 'low_shelf', LSQ: 'low_shelf', HSC: 'high_shelf', HS: 'high_shelf', HSQ: 'high_shelf', LP: 'low_pass', LPQ: 'low_pass', HP: 'high_pass', HPQ: 'high_pass', NO: 'notch', BP: 'band_pass' };
  function parseAutoEq(text) {
    var lines = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) { return line && line.charAt(0) !== '#'; });
    var pre = 0;
    lines.some(function (line) { var m = /^preamp\s*:\s*([-+]?\d+(?:\.\d+)?)\s*db/i.exec(line); if (!m) return false; pre = M.clamp(+m[1], -12, 6); return true; });
    var graphic = lines.filter(function (line) { return /^graphiceq\s*:/i.test(line); })[0];
    if (graphic) {
      var points = graphic.replace(/^graphiceq\s*:/i, '').split(';').map(function (entry) { return entry.trim().split(/\s+/).map(Number); }).filter(function (p) { return p.length >= 2 && Number.isFinite(p[0]) && p[0] > 0 && Number.isFinite(p[1]); }).sort(function (a, b) { return a[0] - b[0]; });
      if (points.length < 2) return null;
      var gains = FREQS.map(function (f) {
        if (f <= points[0][0]) return M.clamp(points[0][1], -12, 12);
        for (var i = 1; i < points.length; i++) {
          if (f > points[i][0]) continue;
          var left = points[i - 1], right = points[i];
          var p = Math.log(f / left[0]) / Math.log(right[0] / left[0]);
          return M.clamp(left[1] + (right[1] - left[1]) * p, -12, 12);
        }
        return M.clamp(points[points.length - 1][1], -12, 12);
      });
      return { graphic: gains, preamp: pre };
    }
    var bands = [];
    lines.forEach(function (line) {
      var m = /^filter\s*\d*\s*:\s*(on|off)\s+([a-z]+)\b(.*)$/i.exec(line);
      if (!m || bands.length >= 10) return;
      var type = AE_TYPES[m[2].toUpperCase()];
      var freq = /\bfc\s+([-+]?\d+(?:\.\d+)?)\s*hz/i.exec(m[3]);
      var gain = /\bgain\s+([-+]?\d+(?:\.\d+)?)\s*db/i.exec(m[3]);
      var q = /\bq\s+(\d+(?:\.\d+)?)/i.exec(m[3]);
      if (!type || !freq || (/^(peak|low_shelf|high_shelf)$/.test(type) && !gain)) return;
      bands.push({ on: m[1].toUpperCase() === 'ON', type: type, f: M.clamp(+freq[1], 20, 20000), g: gain ? M.clamp(+gain[1], -24, 24) : 0, q: q ? M.clamp(+q[1], 0.1, 20) : 0.707 });
    });
    return bands.length ? { bands: bands, preamp: pre } : null;
  }

  /* ---------- 状态判断 ---------- */
  function secActive(sec) { return S.on && (S.sec[sec] !== false); }
  /* 同 AudioEffectsSound.isNeutral()：关掉的分区按默认值算 */
  function zero(v) { return Math.abs(v) < 1e-4; }
  function neutral() {
    var D = NP.sound.defaults;
    var e = function (sec, k) { return S.sec[sec] === false ? D[k] : S[k]; };
    var eqOn = S.sec.equalizer !== false;
    var eqN = !eqOn || S.eq.every(zero);
    var peqN = !eqOn || !S.peqOn || S.peq.every(function (b) { return b.on === false || ((b.type === 'peak' || b.type === 'low_shelf' || b.type === 'high_shelf') && zero(b.g)); });
    var toneN = zero(e('tone', 'bass')) && zero(e('tone', 'treble')) && zero(e('equalizer', 'preamp')) && zero(e('dynamics', 'outGain'));
    var colorN = zero(e('tone', 'virtualBass')) && zero(e('tone', 'warmth')) && zero(e('tone', 'clarity')) && zero(e('tone', 'vocal'));
    var stereoN = zero(e('tone', 'vocalRemoval')) && zero(e('space', 'width') - 1) && zero(e('space', 'monoBass')) && !e('space', 'mono') && !e('space', 'swap') && zero(e('space', 'crossfeed'));
    var spaceN = zero(e('space', 'surround')) && zero(e('space', 'reverb'));
    var limN = !e('dynamics', 'limiter') || (zero(e('dynamics', 'ceiling') + 1) && zero(e('dynamics', 'release') - 80));
    /* 扬声器优化单独判断（NeriDspParams：speakerActive 时即使音色为中性也照常处理） */
    return eqN && peqN && toneN && colorN && stereoN && spaceN && !e('dynamics', 'compOn') && limN && !S.sec.speaker;
  }
  /* 标签上的小圆点：分区里有偏离默认的调节（包括被关掉） */
  function modified(tab) {
    switch (tab) {
      case 'presets': return S.preset !== 'flat';
      case 'equalizer':
      case 'tone':
      case 'space':
      case 'dynamics': return S.sec[tab] === false || !NP.sound.sectionDefault(tab);
      case 'speaker': return !!S.sec.speaker;
      case 'speed': return S.sec.speed === false || Math.abs(P.speed - 1) > 1e-3 || Math.abs(P.pitch - 1) > 1e-3;
      default: return false;
    }
  }
  function swGet(k) {
    if (k === 'on') return S.on;
    if (k.indexOf('sec.') === 0) return !!S.sec[k.slice(4)];
    if (k in S) return !!S[k];
    return !!local[k];
  }
  function swSet(k, v) {
    if (k === 'on') S.on = v;
    else if (k.indexOf('sec.') === 0) { S.sec[k.slice(4)] = v; if (v) S.on = true; }
    else if (k === 'linked') { S.linked = v; P.setPitch(v ? M.clamp(P.speed, 0.25, 2) : 1); }
    else if (k in S) { S[k] = v; if (k !== 'autoHeadroom' && k !== 'limiter') custom(); }
    else local[k] = v;
  }

  /* ---------- 页面实例 ---------- */
  function Page(ph) {
    var self = this;
    this.ph = ph;
    var root = document.createElement('div');
    root.className = 'fxa';
    root.innerHTML = markup('fx-' + ++pageId);
    ph.insertBefore(root, $('.hm-mini', ph) || $('.ph__gesture', ph));
    this.root = root;
    this.scroll = $('[data-scroll]', root);
    this.scroll.addEventListener('scroll', function () {
      self.syncAppBar();
    }, { passive: true });
    this.syncAppBar();
    $('[data-back]', root).addEventListener('click', function () { self.toast(L('这一页就是演示的主角，先不返回了', 'This page is the star of the demo, so it stays put')); });

    $$('[data-sw]', root).forEach(function (row) {
      var k = row.getAttribute('data-sw');
      var flip = function () { if (row.classList.contains('is-dis')) return; swSet(k, !swGet(k)); self.changed(); };
      row.addEventListener('click', flip);
      $('.m3switch', row).addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
    });
    this.sliders = $$('[data-sl]', root).map(function (el) {
      var k = el.getAttribute('data-sl');
      var spec = SL[k];
      var xs = $('.xslider', el);
      var range = $('input', xs);
      var commit = function (v, snap) {
        if (el.classList.contains('is-dis')) return;
        if (!Number.isFinite(v)) return;
        v = M.clamp(snap ? Math.round(v / spec[3]) * spec[3] : v, spec[2][0], spec[2][1]);
        spec[1](v);
        if (spec[5] && S.sec[spec[5]] === false && spec[5] !== 'speaker') S.sec[spec[5]] = true;
        self.changed();
      };
      range.addEventListener('input', function () { commit(+range.value, true); });
      $('[data-v]', el).addEventListener('click', function () {
        self.editNumber($('b', el).textContent, spec[0](), spec[2], function (v) { commit(v, false); });
      });
      return { k: k, el: el, xs: xs, range: range, val: $('[data-v]', el) };
    });
    $$('[data-quick]', root).forEach(function (box) {
      var k = box.getAttribute('data-quick');
      $$('[data-q]', box).forEach(function (b) {
        b.addEventListener('click', function () {
          var v = parseFloat(b.getAttribute('data-q'));
          if (k === 'speed') SL.speed[1](v); else SL.pitch[1](v);
          S.sec.speed = true;
          self.changed();
        });
      });
    });
    this.segs = $$('[data-seg]', root).map(function (box) {
      var k = box.getAttribute('data-seg');
      var btns = $$('button', box);
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          if (k === 'cat') { local.cat = +b.getAttribute('data-i'); self.fillPresets(true); }
          else if (k in S) { if (!S.on || !S.sec.speaker) return; S[k] = b.getAttribute('data-v'); }
          else local[k] = b.getAttribute('data-v');
          if (k === 'cat') self.paint(); else self.changed();
        });
        b.addEventListener('keydown', function (e) {
          var i = btns.indexOf(b), next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : null;
          if (next === null) return;
          e.preventDefault();
          var target = btns[(next + btns.length) % btns.length];
          target.click(); target.focus();
        });
      });
      return { k: k, box: box, btns: btns, ind: $('.fxa-seg__ind', box) };
    });
    this.whens = $$('[data-when]', root);
    this.tabs = $$('[data-tab]', root);
    this.tabRow = $('[data-tabs]', root);
    this.ind = $('.fxa-ind', root);
    this.panes = $$('[data-pane]', root);
    this.tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { self.setTab(b.getAttribute('data-tab')); });
      b.addEventListener('keydown', function (e) {
        var next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? self.tabs.length - 1 : null;
        if (next === null) return;
        e.preventDefault();
        var target = self.tabs[(next + self.tabs.length) % self.tabs.length];
        self.setTab(target.getAttribute('data-tab')); target.focus();
      });
    });
    this.tabRow.addEventListener('scroll', function () { self.placeInd(true); }, { passive: true });
    $$('[data-na]', root).forEach(function (b) { b.addEventListener('click', function () { self.toast(T.na(b.getAttribute('data-na'))); }); });
    $$('[data-reset]', root).forEach(function (b) { b.addEventListener('click', function () { self.resetSection(b.getAttribute('data-reset')); }); });
    $('[data-reset-all]', root).addEventListener('click', function () { self.resetAll(); });
    $$('[data-band]', root).forEach(function (b) { b.addEventListener('click', function () { local.band = M.clamp(local.band + +b.getAttribute('data-band'), 0, 9); self.paint(); }); });
    $$('[data-step]', root).forEach(function (b) { b.addEventListener('click', function () { if (!secActive('equalizer')) return; S.eq[local.band] = M.clamp(S.eq[local.band] + parseFloat(b.getAttribute('data-step')), -12, 12); custom(); self.changed(); }); });
    $('[data-band-val]', root).addEventListener('click', function () { if (!secActive('equalizer')) return; self.editNumber(fHz(FREQS[local.band]), S.eq[local.band], [-12, 12], function (v) { S.eq[local.band] = v; custom(); self.changed(); }); });
    this.presetBox = $('[data-presets]', root);
    this.fillPresets(false);
    this.peqBox = $('[data-peq]', root);
    var dlg = $('[data-dlg]', root);
    var ta = $('textarea', dlg);
    this.dlg = dlg;
    this.editDlg = $('[data-edit-dlg]', root);
    $('[data-peq-import]', root).addEventListener('click', function () { if (!secActive('equalizer')) return; ta.value = AUTOEQ_SAMPLE; self.openDlg(true); });
    $('[data-dlg-cancel]', root).addEventListener('click', function () { self.openDlg(false); });
    $('[data-dlg-ok]', root).addEventListener('click', function () {
      var result = parseAutoEq(ta.value);
      if (!result) { self.toast(T.peqFail); return; }
      if (result.graphic) S.eq = result.graphic;
      else { S.peq = result.bands; S.peqOn = true; }
      S.preamp = result.preamp;
      custom();
      self.openDlg(false);
      self.toast(result.graphic ? T.graphicDone : T.peqDone(result.bands.length));
      self.changed();
    });
    [dlg, this.editDlg].forEach(function (modal) {
      modal.addEventListener('click', function (e) { if (e.target === modal) self.openDlg(false, modal); });
      modal.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); self.openDlg(false, modal); }
        if (e.key !== 'Tab') return;
        var controls = $$('button:not([disabled]), input:not([disabled]), textarea, select', modal).filter(function (el) { return !el.hidden && el.offsetWidth; });
        var first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    });
    $('[data-edit-cancel]', root).addEventListener('click', function () { self.openDlg(false, self.editDlg); });
    $('[data-peq-save]', root).addEventListener('click', function () { if (self.saveEdit && self.saveEdit() !== false) self.openDlg(false, self.editDlg); });
    $('[data-peq-delete]', root).addEventListener('click', function () { if (self.deleteEdit) self.deleteEdit(); self.openDlg(false, self.editDlg); });
    this.peqBox.addEventListener('click', function (e) { var row = e.target.closest('[data-peq-edit]'); if (row && secActive('equalizer')) self.editBand(+row.getAttribute('data-peq-edit')); });
    $('[data-peq-add]', root).addEventListener('click', function () {
      if (!secActive('equalizer') || S.peq.length >= 10) return;
      S.peq = S.peq.concat([{ on: true, type: 'peak', f: 1000, g: 0, q: 0.707 }]);
      S.peqOn = true;
      custom();
      self.changed();
    });
    $('[data-peq-clear]', root).addEventListener('click', function () { if (!secActive('equalizer')) return; S.peq = []; S.peqOn = false; custom(); self.changed(); });
    this.status = $('[data-status]', root);
    this.lim = $('[data-lim]', root);
    this.graph = null;
    this.graphBox = $('[data-graph]', root);
    var play = $('[data-dsp-play]', ph);
    if (play) {
      play.addEventListener('click', function (e) { e.stopPropagation(); P.toggle(); });
      P.on(function () {
        var u = $('use', play);
        var href = P.playing && P.audible ? '#i-pause' : '#i-play-o';
        if (u.getAttribute('href') !== href) { u.setAttribute('href', href); var sv = $('svg', play); sv.classList.remove('ph-icon-swap'); void sv.getBoundingClientRect(); sv.classList.add('ph-icon-swap'); }
        play.setAttribute('aria-label', P.playing && P.audible ? L('暂停', 'Pause') : L('播放', 'Play'));
      });
    }
    var mini = $('.hm-mini', ph);
    if (mini) mini.addEventListener('click', function () { self.toast(L('播放页在第 01 站，这里先专心调音效', 'Now Playing lives at stop 01 — this one is all about sound')); });
    this.setTab('presets', true);
    P.on(function () { self.paint(); });
  }
  function compactTitleAlpha(fraction) {
    if (fraction <= 0 || fraction >= 1) return fraction;
    var low = 0, high = 1, t = 0.5;
    for (var i = 0; i < 14; i++) {
      t = (low + high) / 2;
      var x = 2.4 * (1 - t) * t + t * t * t;
      if (x < fraction) low = t; else high = t;
    }
    return 0.45 * (1 - t) * t * t + t * t * t;
  }
  Page.prototype.syncAppBar = function () {
    var fraction = M.clamp(this.scroll.scrollTop / 88);
    var compact = fraction >= 0.5;
    this.root.style.setProperty('--c', fraction.toFixed(3));
    this.root.style.setProperty('--title-expanded', (1 - fraction).toFixed(3));
    this.root.style.setProperty('--title-compact', compactTitleAlpha(fraction).toFixed(3));
    this.root.classList.toggle('is-collapsed', compact);
    $('.fxa-bar__t', this.root).setAttribute('aria-hidden', compact ? 'false' : 'true');
    $('.fxa-large', this.root).setAttribute('aria-hidden', compact ? 'true' : 'false');
  };
  Page.prototype.toast = function (m) { if (NP.phoneSnack) NP.phoneSnack(this.ph, m); };
  Page.prototype.changed = function () {
    NP.sound.apply();
    this.paint();
    if (!NP.sound.live() && !Page.hinted) { Page.hinted = true; this.toast(T.hint); }
    if (NP.desktopSim && NP.desktopSim.sim && NP.desktopSim.sim.syncFx) NP.desktopSim.sim.syncFx();
    if (NP.dspChain) NP.dspChain();
  };
  Page.prototype.openDlg = function (on, dialog) {
    var d = dialog || this.dlg;
    if (on) {
      d._opener = document.activeElement;
      d.hidden = false; void d.offsetWidth; d.classList.add('is-open');
      this.scroll.inert = true;
      $('textarea, input, select, button', d).focus({ preventScroll: true });
    } else {
      d.classList.remove('is-open'); d.hidden = true;
      this.scroll.inert = false;
      var opener = d._opener && d._opener.isConnected ? d._opener : $('[data-peq-add]', this.root);
      if (opener) opener.focus({ preventScroll: true });
    }
  };
  Page.prototype.editor = function (title, body, save, remove) {
    var d = this.editDlg;
    txt($('[data-edit-title]', d), title);
    $('[role="dialog"]', d).setAttribute('aria-label', title);
    $('[data-edit-body]', d).innerHTML = body;
    $('[data-peq-delete]', d).hidden = !remove;
    this.saveEdit = save;
    this.deleteEdit = remove;
    this.openDlg(true, d);
  };
  Page.prototype.editNumber = function (title, value, range, commit) {
    var self = this;
    this.editor(title, '<label class="fxa-field">' + title + '<input data-number type="number" inputmode="decimal" step="any" min="' + range[0] + '" max="' + range[1] + '" value="' + value + '"></label>', function () {
      var input = $('[data-number]', self.editDlg);
      if (!input.value || !input.reportValidity()) return false;
      commit(M.clamp(+input.value, range[0], range[1]));
    });
  };
  Page.prototype.editBand = function (index) {
    var self = this, band = S.peq[index];
    if (!band) return;
    var field = function (key, label, min, max) { return '<label class="fxa-field">' + label + '<input type="number" step="any" inputmode="decimal" data-peq-field="' + key + '" min="' + min + '" max="' + max + '" value="' + band[key] + '"></label>'; };
    this.editor(T.peqEdit,
      '<label class="fxa-field fxa-field--check"><input type="checkbox" data-peq-on' + (band.on !== false ? ' checked' : '') + '>' + T.peqEnabled + '</label>' +
      '<label class="fxa-field">' + T.peq + '<select data-peq-type>' + Object.keys(T.ftype).map(function (key) { return '<option value="' + key + '"' + (band.type === key ? ' selected' : '') + '>' + T.ftype[key] + '</option>'; }).join('') + '</select></label>' +
      field('f', T.frequency, 20, 20000) + field('g', T.gain, -24, 24) + field('q', 'Q', 0.1, 20),
      function () {
        var inputs = $$('[data-peq-field]', self.editDlg);
        if (inputs.some(function (input) { return !input.value || !input.reportValidity(); })) return false;
        var updated = { on: $('[data-peq-on]', self.editDlg).checked, type: $('[data-peq-type]', self.editDlg).value };
        inputs.forEach(function (input) { updated[input.getAttribute('data-peq-field')] = +input.value; });
        S.peq[index] = updated; S.peqOn = true; custom(); self.changed();
      }, function () { S.peq.splice(index, 1); custom(); self.changed(); });
  };
  Page.prototype.setTab = function (tab, instant) {
    var self = this;
    if (local.tab !== tab && local.tab === 'dynamics') local.compAdv = false;
    local.tab = tab;
    this.tabs.forEach(function (b) { var on = b.getAttribute('data-tab') === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    this.panes.forEach(function (p) {
      var on = p.getAttribute('data-pane') === tab;
      if (on === p.classList.contains('is-on')) return;
      p.classList.toggle('is-on', on);
      if (on && !instant && !NP.env.reduced) { p.classList.add('is-enter'); void p.offsetWidth; p.classList.remove('is-enter'); }
    });
    var b = this.tabs.filter(function (x) { return x.getAttribute('data-tab') === tab; })[0];
    var visible = b && b.offsetLeft >= this.tabRow.scrollLeft && b.offsetLeft + b.offsetWidth <= this.tabRow.scrollLeft + this.tabRow.clientWidth;
    if (b && (document.documentElement.getAttribute('data-app-style') !== 'clean' || !visible)) {
      this.tabRow.scrollTo({ left: b.offsetLeft - (this.tabRow.clientWidth - b.offsetWidth) / 2, behavior: instant || NP.env.reduced ? 'auto' : 'smooth' });
    }
    if (tab === 'equalizer' && !this.graph) { this.graph = new Graph(this.graphBox, this); }
    this.paint();
    requestAnimationFrame(function () { self.measureRows(); self.placeInd(instant); self.placeSegs(true); });
    if (Page.onTab) Page.onTab(tab);
  };
  Page.prototype.fillPresets = function (animate) {
    var box = this.presetBox;
    var self = this;
    var cat = T.cats[local.cat][0];
    var build = function () {
      if (cat === 'mine') box.innerHTML = '<p class="fxa-note">' + T.mineEmpty + '</p>';
      else box.innerHTML = NP.sound.presets.filter(function (p) { return p.cat === cat; }).map(function (p, i) { return '<span class="fxa-chipw" style="--i:' + i + '"><button type="button" class="fxa-chip" data-id="' + p.id + '">' + p.name + '</button></span>'; }).join('');
      $$('[data-id]', box).forEach(function (b) {
        b.addEventListener('click', function () { NP.sound.usePreset(b.getAttribute('data-id')); self.changed(); });
      });
      self.paint();
      box.classList.remove('is-out');
    };
    if (!animate || NP.env.reduced) { build(); return; }
    box.classList.add('is-out');
    clearTimeout(box._t);
    box._t = setTimeout(build, 120);
  };
  Page.prototype.resetSection = function (sec) {
    var secs = NP.sound.sections;
    if (sec === 'speaker') NP.sound.resetSection(sec);
    else if (secs[sec]) {
      var was = NP.sound.sectionDefault(sec) && S.sec[sec] !== false;
      NP.sound.resetSection(sec);
      if (!was) S.preset = ['equalizer', 'tone', 'space', 'dynamics'].every(function (k) { return NP.sound.sectionDefault(k) && S.sec[k] !== false; }) ? 'flat' : 'custom';
    } else if (sec === 'speed') { P.setSpeed(1); P.setPitch(1); S.sec.speed = true; }
    this.changed();
  };
  Page.prototype.resetAll = function () {
    NP.sound.usePreset('flat');
    ['equalizer', 'tone', 'space', 'dynamics', 'speed'].forEach(this.resetSection, this);
    S.preset = 'flat';
    this.changed();
  };
  /* M3 ListItem：说明文字折成多行时按三行列表项排版（88dp 高、上下 12dp） */
  Page.prototype.measureRows = function () {
    $$('.fxa-li', this.root).forEach(function (row) {
      var d = $('.fxa-li__t span', row);
      if (d && d.offsetHeight) row.classList.toggle('is-3', d.offsetHeight > 24);
    });
  };
  Page.prototype.placeInd = function (jump) {
    var b = this.tabs.filter(function (x) { return x.getAttribute('data-tab') === local.tab; })[0];
    if (!b || !b.offsetWidth) return;
    var span = $('span', b);
    if (jump) this.ind.classList.add('is-jump');
    this.ind.style.width = span.offsetWidth + 'px';
    this.ind.style.translate = (b.offsetLeft + span.offsetLeft) + 'px 0';
    if (jump) { void this.ind.offsetWidth; this.ind.classList.remove('is-jump'); }
  };
  Page.prototype.placeSegs = function (jump) {
    this.segs.forEach(function (sg) {
      var i = sg.k === 'cat' ? local.cat : Math.max(0, sg.btns.map(function (b) { return b.getAttribute('data-v'); }).indexOf(sg.k in S ? S[sg.k] : local[sg.k]));
      var b = sg.btns[i];
      if (!b || !b.offsetWidth) return;
      if (jump) sg.ind.classList.add('is-jump');
      sg.ind.style.width = b.offsetWidth + 'px';
      sg.ind.style.translate = b.offsetLeft + 'px 0';
      if (jump) { void sg.ind.offsetWidth; sg.ind.classList.remove('is-jump'); }
      sg.btns.forEach(function (x, k) { x.classList.toggle('is-on', k === i); x.setAttribute('aria-checked', k === i ? 'true' : 'false'); x.tabIndex = k === i ? 0 : -1; });
    });
  };
  function txt(el, t) { if (el && el.textContent !== t) el.textContent = t; }
  Page.prototype.paint = function () {
    var root = this.root;
    if (!this.status || !this.peqBox) return;
    var neu = neutral();
    var rt = NP.dspRuntime || { rate: null, limDb: 0 };
    txt(this.status, !S.on ? T.disabled : neu ? T.neutral : rt.rate ? T.activeRate(rt.rate) : T.active);
    var limiting = S.limiter && rt.limDb > 0;
    txt(this.lim, !S.limiter ? T.limOff : limiting ? T.limited(fDb(-rt.limDb)) : T.limIdle);
    this.lim.classList.toggle('is-hot', limiting);
    this.lim.hidden = !S.on || neu;
    $$('[data-sw]', root).forEach(function (row) {
      var k = row.getAttribute('data-sw');
      var on = swGet(k);
      var sw = $('.m3switch', row);
      sw.classList.toggle('is-on', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      var sec = row.closest('[data-sec]');
      var dis = !!sec && k.indexOf('sec.') !== 0 && !secActive(sec.getAttribute('data-sec'));
      row.classList.toggle('is-dis', dis);
      sw.setAttribute('aria-disabled', dis ? 'true' : 'false'); sw.tabIndex = dis ? -1 : 0;
      /* 外放优化开着但总开关关闭时不会生效，分区开关如实提示（isSpeakerOptimizerBlockedByMaster） */
      if (k === 'sec.speaker') txt($('[data-sw-desc]', row), S.sec.speaker && !S.on ? T.spkMasterOff : T.secDesc);
    });
    this.sliders.forEach(function (s) {
      var spec = SL[s.k];
      var v = spec[0]();
      var r = spec[2];
      s.xs.style.setProperty('--v', M.clamp((v - r[0]) / (r[1] - r[0])).toFixed(4));
      txt(s.val, spec[4](v));
      s.range.value = v;
      s.range.setAttribute('aria-valuetext', spec[4](v));
      var sec = s.el.closest('[data-sec]');
      var dis = (!!sec && !(sec.getAttribute('data-sec') === 'speaker' ? S.on && S.sec.speaker : secActive(sec.getAttribute('data-sec')))) || (s.k === 'pitch' && S.linked);
      s.el.classList.toggle('is-dis', dis);
      s.range.disabled = dis; s.val.disabled = dis;
    });
    this.whens.forEach(function (w) {
      var on = w.getAttribute('data-when').split('&').every(function (c) {
        var neg = c.charAt(0) === '!';
        var k = neg ? c.slice(1) : c;
        var v = k in S ? !!S[k] : !!local[k];
        return neg ? !v : v;
      });
      if (w._on === on) return;
      w._on = on;
      w.classList.toggle('is-shut', !on);
      w.setAttribute('aria-hidden', on ? 'false' : 'true');
      w.inert = !on;
    });
    $$('[data-quick]', root).forEach(function (box) {
      var k = box.getAttribute('data-quick');
      var cur = k === 'speed' ? P.speed : semis(P.pitch);
      var dis = !secActive('speed');
      $$('[data-q]', box).forEach(function (b) { b.classList.toggle('is-on', Math.abs(parseFloat(b.getAttribute('data-q')) - cur) < (k === 'speed' ? 1e-3 : 0.25)); b.disabled = dis; });
    });
    $$('[data-id]', this.presetBox).forEach(function (b) { b.classList.toggle('is-on', S.on && b.getAttribute('data-id') === S.preset); });
    $('[data-custom]', root).classList.toggle('is-hide', !(S.on && S.preset === 'custom'));
    this.tabs.forEach(function (b) { b.classList.toggle('is-mod', modified(b.getAttribute('data-tab'))); });
    $$('[data-sec]', root).forEach(function (c) { c.classList.toggle('is-off', c.getAttribute('data-sec') === 'speaker' ? !(S.on && S.sec.speaker) : !secActive(c.getAttribute('data-sec'))); });
    $$('[data-sec] button', root).forEach(function (button) { if (button.closest('[data-sl]')) return; var sec = button.closest('[data-sec]').getAttribute('data-sec'); button.disabled = !secActive(sec); });
    $('[data-peq-add]', root).disabled = !secActive('equalizer') || S.peq.length >= 10;
    $$('[data-band]', root).forEach(function (button) { var direction = +button.getAttribute('data-band'); button.disabled = direction < 0 ? local.band === 0 : local.band === 9; });
    $$('[data-step]', root).forEach(function (button) { button.disabled = !secActive('equalizer') || (+button.getAttribute('data-step') < 0 ? S.eq[local.band] <= -12 : S.eq[local.band] >= 12); });
    var md = $('[data-mode-desc]', root);
    txt(md, T.modeD[local.mode]);
    this.placeSegs(false);
    txt($('[data-band-name]', root), fHz(FREQS[local.band]).replace('31 Hz', '31.25 Hz').replace('63 Hz', '62.5 Hz'));
    txt($('[data-band-val]', root), fDb(S.eq[local.band]));
    // PEQ 行
    var sig = JSON.stringify(S.peq) + S.peqOn;
    if (sig !== this._peq) {
      this._peq = sig;
      this.peqBox.innerHTML = S.peq.length ? S.peq.map(function (b, index) {
        var gain = b.type === 'peak' || b.type === 'low_shelf' || b.type === 'high_shelf' ? fDb(b.g) : '—';
        return '<button type="button" data-peq-edit="' + index + '" class="fxa-li fxa-li--peq"><span class="fxa-li__t"><b>' + T.ftype[b.type] + '</b><span>' + fHz(b.f) + ' · ' + gain + ' · Q ' + b.q.toFixed(2) + '</span></span>' + (b.on === false ? '<em class="fxa-li__end">' + T.off + '</em>' : '') + '</button>';
      }).join('') : note(T.peqEmpty);
    }
    $$('[data-peq-edit]', root).forEach(function (button) { button.disabled = !secActive('equalizer'); });
    $('[data-peq-clear]', root).hidden = !S.peq.length;
    var gw = this.graphBox.clientWidth && innerW(this.graphBox);
    if (this.graph && gw > 0 && Math.abs(gw - this.graph.W) > 0.5) {
      // 曲线按创建时的宽度画，宽度变了就重建，免得 SVG 被等比缩小
      this.graphBox.textContent = '';
      this.graph = new Graph(this.graphBox, this);
    }
    if (this.graph) this.graph.paint();
  };

  /* ---------- 站台：分区索引、信号链 ---------- */
  function initStation(page) {
    var idx = $$('#dsp [data-dsp-tab]');
    Page.onTab = function (tab) {
      idx.forEach(function (b) { var on = b.getAttribute('data-dsp-tab') === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    };
    idx.forEach(function (b) {
      b.addEventListener('click', function () {
        var tab = b.getAttribute('data-dsp-tab');
        page.setTab(tab);
        var list = $('.fxa-tabs', page.root);
        page.scroll.scrollTo({ top: Math.max(0, list.offsetTop - 8), behavior: NP.env.reduced ? 'auto' : 'smooth' });
        var dev = $('#deviceDsp');
        var r = dev.getBoundingClientRect();
        if (r.bottom < 80 || r.top > innerHeight - 80) NP.scrollTo(NP.absTop(dev) - 100);
      });
    });
    Page.onTab(local.tab);
    $$('[data-open-desk-fx]').forEach(function (b) {
      b.addEventListener('click', function () {
        var sim = NP.desktopSim && NP.desktopSim.sim;
        var st = $('#deskStage');
        if (st) NP.scrollTo(NP.absTop(st) - 90);
        if (sim) setTimeout(function () { sim.go('fx'); }, 500);
      });
    });
  }

  /* 效果监视器（dsp-scope.js）要用的判断 */
  NP.dspState = { neutral: neutral, secActive: secActive, local: local, response: response, biquad: biquad, mag: mag, fDb: fDb, fHz: fHz, freqs: FREQS };

  NP.dsp = {
    mount: function (ph) {
      var page = new Page(ph);
      if (NP.whenVisible) NP.whenVisible(ph, function () { page.measureRows(); page.placeInd(true); page.placeSegs(true); });
      document.addEventListener('np-app-style', function () { page.measureRows(); page.placeInd(true); page.placeSegs(true); page.paint(); });
      return page;
    },
    init: function () {
      var ph = $('#phDsp');
      if (!ph) return;
      var page = new Page(ph);
      NP.dsp.page = page;
      initStation(page);
      if (NP.dspScope) NP.dspScope.init(page);
      if (NP.whenVisible) NP.whenVisible(ph, function () { page.measureRows(); page.placeInd(true); page.placeSegs(true); });
      if (document.fonts) document.fonts.ready.then(function () { page.measureRows(); page.placeInd(true); });
      document.addEventListener('np-app-style', function () {
        requestAnimationFrame(function () { page.measureRows(); page.placeInd(true); page.placeSegs(true); page.paint(); });
      });
    },
  };
})();
