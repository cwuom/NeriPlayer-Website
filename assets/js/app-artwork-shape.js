(function () {
  'use strict';
  // same geometry as ContinuousRoundedCornerShape, adapted from miuix-squircle (Apache-2.0, compose-miuix-ui contributors)
  function path(width, height, radius, smoothing) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'M 0 0 Z';
    var half = Math.min(width, height) / 2;
    var r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    var s = Number.isFinite(smoothing) ? Math.max(0, Math.min(1, smoothing)) : 0;
    if (!s) {
      r = Math.min(r, half);
      return 'M ' + r + ' 0 L ' + (width - r) + ' 0 A ' + r + ' ' + r + ' 0 0 1 ' + width + ' ' + r +
        ' L ' + width + ' ' + (height - r) + ' A ' + r + ' ' + r + ' 0 0 1 ' + (width - r) + ' ' + height +
        ' L ' + r + ' ' + height + ' A ' + r + ' ' + r + ' 0 0 1 0 ' + (height - r) +
        ' L 0 ' + r + ' A ' + r + ' ' + r + ' 0 0 1 ' + r + ' 0 Z';
    }
    var tile = Math.min(r * (1 + .1 * s), half);
    var handle = tile * (1 - (.55228475 + (.643 - .55228475) * s));
    return 'M ' + tile + ' 0 L ' + (width - tile) + ' 0 C ' + (width - handle) + ' 0 ' + width + ' ' + handle + ' ' + width + ' ' + tile +
      ' L ' + width + ' ' + (height - tile) + ' C ' + width + ' ' + (height - handle) + ' ' + (width - handle) + ' ' + height + ' ' + (width - tile) + ' ' + height +
      ' L ' + tile + ' ' + height + ' C ' + handle + ' ' + height + ' 0 ' + (height - handle) + ' 0 ' + (height - tile) +
      ' L 0 ' + tile + ' C 0 ' + handle + ' ' + handle + ' 0 ' + tile + ' 0 Z';
  }
  window.NP.artworkShape = {
    path: path,
    clip: function (width, height, radius, smoothing) { return "path('" + path(width, height, radius, smoothing) + "')"; }
  };
})();
