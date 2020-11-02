const Sharp = require('sharp');
const IIIFError = require('./error');

// Integer RegEx
const IR = '\\d+';
// Float RegEx
const FR = '\\d+(?:\.\\d+)?'; // eslint-disable-line no-useless-escape

const Validators = {
  quality: ['color', 'gray', 'bitonal', 'default'],
  format: ['jpg', 'tif', 'gif', 'png', 'webp'],
  region: ['full', 'square', `pct:${FR},${FR},${FR},${FR}`, `${IR},${IR},${IR},${IR}`],
  size: ['full', 'max', `pct:${FR}`, `${IR},`, `,${IR}`, `\\!?${IR},${IR}`],
  rotation: `\\!?${FR}`
};

function validator (type) {
  var result = Validators[type];
  if (result instanceof Array) {
    result = result.join('|');
  }
  return new RegExp('^(' + result + ')$');
}

function validate (type, v) {
  if (!validator(type).test(v)) {
    throw new IIIFError(`Invalid ${type}: ${v}`);
  }
  return true;
}

class Operations {
  constructor (dims) {
    this.dims = dims;
    this.pipeline = Sharp({ limitInputPixels: false });
  }

  region (v) {
    validate('region', v);

    if (v === 'full') {
      // do nothing
    } else if (v === 'square') {
      this._regionSquare(this.dims);
    } else if (v.match(/^pct:([\d,]+)/)) {
      this._regionPct(RegExp.$1, this.dims);
    } else {
      this._regionXYWH(v);
    }

    const ifPositive = (a, b) => a > 0 ? a : b;
    this.dims.width = ifPositive(this.pipeline.options.widthPre, this.dims.width);
    this.dims.height = ifPositive(this.pipeline.options.heightPre, this.dims.height);
    return this;
  }

  size (v) {
    validate('size', v);

    if (v === 'full' || v === 'max') {
      // do nothing
    } else if (v.match(/^pct:([\d]+)/)) {
      this._sizePct(RegExp.$1, this.dims);
    } else {
      this._sizeWH(v);
    }
    return this;
  }

  rotation (v) {
    validate('rotation', v);

    if (v === '0') {
      return this;
    }

    if (v[0] === '!') {
      this.pipeline = this.pipeline.flop();
    }
    var value = Number(v.replace(/^!/, ''));
    if (isNaN(value)) {
      throw new IIIFError(`Invalid rotation value: ${v}`);
    }
    this.pipeline = this.pipeline.rotate(value);
    return this;
  }

  quality (v) {
    validate('quality', v);
    if (v === 'color' || v === 'default') {
      // do nothing
    } else if (v === 'gray') {
      this.pipeline = this.pipeline.grayscale();
    } else if (v === 'bitonal') {
      this.pipeline = this.pipeline.threshold();
    }
    return this;
  }

  format (v) {
    validate('format', v);
    this.pipeline = this.pipeline.toFormat(v);
    return this;
  }

  _regionSquare (dims) {
    if (dims.width !== dims.height) {
      var side = Math.min(dims.width, dims.height);
      var params = { width: side, height: side };
      var offset = Math.abs(Math.floor((dims.width - dims.height) / 2));
      if (dims.width > dims.height) {
        params.left = offset;
        params.top = 0;
      } else {
        params.left = 0;
        params.top = offset;
      }
      this.pipeline = this.pipeline.extract(params);
    }
  }

  _regionPct (v, dims) {
    var x, y, w, h;
    [x, y, w, h] = v.split(/\s*,\s*/).map(pct => { return (Number(pct) / 100.0); });
    [x, w] = [x, w].map(val => Math.round(dims.width * val));
    [y, h] = [y, h].map(val => Math.round(dims.height * val));
    this._regionXYWH([x, y, w, h]);
  }

  _regionXYWH (v) {
    if (typeof v === 'string') {
      v = v.split(/\s*,\s*/).map(val => Number(val));
    }
    var params = { left: v[0], top: v[1], width: v[2], height: v[3] };
    if (params.width === 0 || params.height === 0) {
      throw new IIIFError(`Region width and height must both be > 0`);
    }
    this.pipeline = this.pipeline.extract(params);
  }

  _sizePct (v, dims) {
    var pct = Number(v);
    if (isNaN(pct) || pct <= 0) {
      throw new IIIFError(`Invalid resize %: ${v}`);
    }
    var width = Math.round(dims.width * (pct / 100.0));
    this._sizeWH(`${width},`);
  }

  _sizeWH (v) {
    var params = { fit: 'cover' };
    if (typeof v === 'string') {
      if (v[0] === '!') {
        params.fit = 'inside';
      }
      v = v.replace(/^!/, '').split(/\s*,\s*/).map(val => val === '' ? null : Number(val));
    }
    [params.width, params.height] = v;
    if (params.width === 0 || params.height === 0) {
      throw new IIIFError(`Resize width and height must both be > 0`);
    }
    this.pipeline = this.pipeline.resize(params);
  }
}

module.exports = {
  Qualities: Validators.quality,
  Formats: Validators.format,
  Operations,
  IIIFError
};
