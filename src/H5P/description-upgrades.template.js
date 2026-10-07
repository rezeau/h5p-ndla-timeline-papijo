// H5P's documented registration pattern preserves upgrades from other libraries.
// eslint-disable-next-line no-use-before-define
var H5PUpgrades = H5PUpgrades || {};

// Version 1.2 schema upgrade from legacy 1.1 description library selectors.
H5PUpgrades['H5P.NDLATimelinePapiJo'] = (function () {
  'use strict';

  // HTML5 named character references, including permitted semicolonless forms.
  // Data: Python 3.13 html.entities.html5, derived from the WHATWG HTML standard.
  // Inlined by scripts/build-upgrades.js: no imports, DOM, or runtime dependency.
  // eslint-disable-next-line quotes, comma-spacing, object-curly-spacing
  var namedEntities = /* HTML_ENTITIES */ {};
  var controlReferences = {
    128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224,
    135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338,
    142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226,
    150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250,
    156: 339, 158: 382, 159: 376
  };

  function decodeEntities(text) {
    return text.replace(/&(#(?:[xX][\da-fA-F]+|\d+);?|[a-zA-Z][a-zA-Z\d]*;?)/g, function (reference, body) {
      if (body.charAt(0) === '#') {
        var hexadecimal = body.charAt(1).toLowerCase() === 'x';
        var point = parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        if (!point || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
          return '\ufffd';
        }
        point = controlReferences[point] || point;
        if (point <= 0xffff) {
          return String.fromCharCode(point);
        }
        point -= 0x10000;
        return String.fromCharCode(0xd800 + (point >> 10), 0xdc00 + (point & 0x3ff));
      }
      // HTML text permits a longest valid prefix for semicolonless references.
      for (var length = body.length; length > 0; length -= 1) {
        var name = body.slice(0, length);
        if (Object.prototype.hasOwnProperty.call(namedEntities, name)) {
          return namedEntities[name] + body.slice(length);
        }
      }
      return reference;
    });
  }

  /** A text-only tokenizer for saved editor HTML, usable inside an H5P worker. */
  function htmlToPlainText(source) {
    var output = '';
    var position = 0;
    var suppressed = [];
    var preformatted = false;
    var block = /^(?:address|article|aside|blockquote|caption|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|tfoot|thead|tr|ul)$/;
    var hidden = /^(?:head|iframe|noscript|object|template)$/;
    var rawHidden = /^(?:script|style)$/;

    function lineBreak(force) {
      if (force || (output && !/\n[ \t]*$/.test(output))) {
        output += '\n';
      }
    }

    function appendText(text) {
      if (suppressed.length) {
        return;
      }
      var decoded = decodeEntities(text).replace(/\u00a0/g, ' ');
      output += preformatted ? decoded.replace(/\r\n?/g, '\n') : decoded.replace(/[\t\r\n\f ]+/g, ' ');
    }

    while (position < source.length) {
      if (source.charAt(position) !== '<') {
        var next = source.indexOf('<', position);
        next = next === -1 ? source.length : next;
        appendText(source.slice(position, next));
        position = next;
        continue;
      }
      if (source.slice(position, position + 4) === '<!--') {
        var commentEnd = source.indexOf('-->', position + 4);
        position = commentEnd === -1 ? source.length : commentEnd + 3;
        continue;
      }
      var match = /^<(\/?)([a-zA-Z][a-zA-Z\d:-]*)(?=[\s/>]|$)/.exec(source.slice(position));
      if (!match && !/^<[!?]/.test(source.slice(position))) {
        appendText('<');
        position += 1;
        continue;
      }

      // A '>' inside an attribute (including tooltip HTML) is not a tag end.
      var end = position + (match ? match[0].length : 2);
      var quote = '';
      for (; end < source.length; end += 1) {
        var character = source.charAt(end);
        if (quote) {
          if (character === quote) {
            quote = '';
          }
        }
        else if (character === '"' || character === '\'') {
          quote = character;
        }
        else if (character === '>' || character === '<') {
          break;
        }
      }
      // An unfinished tag is discarded; a later tag can still be processed.
      var selfClosing = /\/\s*$/.test(source.slice(position, end));
      position = source.charAt(end) === '>' ? end + 1 : end;
      if (!match) {
        continue;
      }
      var tag = match[2].toLowerCase();
      var closing = match[1] === '/';
      if (rawHidden.test(tag) && !closing) {
        var rawEnd = new RegExp('</' + tag + '\\s*>', 'ig');
        rawEnd.lastIndex = position;
        var rawMatch = rawEnd.exec(source);
        position = rawMatch ? rawEnd.lastIndex : source.length;
        continue;
      }
      if (hidden.test(tag)) {
        if (!closing && !selfClosing) {
          suppressed.push(tag);
        }
        else if (closing && suppressed.indexOf(tag) !== -1) {
          suppressed.length = suppressed.lastIndexOf(tag);
        }
        continue;
      }
      if (suppressed.length) {
        continue;
      }
      if (block.test(tag)) {
        lineBreak(false);
      }
      else if (tag === 'br') {
        lineBreak(true);
      }
      else if (tag === 'td' || tag === 'th') {
        // Opening cells also separate text when saved HTML omits </td>.
        if (closing || (output && !/[\n\t][ ]*$/.test(output))) {
          output += '\t';
        }
      }
      if (tag === 'pre') {
        preformatted = !closing;
      }
    }

    return output.replace(/ *\t */g, '\t').replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function upgradeDescriptions(parameters, finished) {
    var replacements = [];

    function inspect(slide, location) {
      if (!slide || slide.description === undefined || typeof slide.description === 'string') {
        return;
      }
      var description = slide.description;
      if (!description || typeof description !== 'object' || Array.isArray(description) ||
          typeof description.library !== 'string' ||
          !/^H5P\.(AdvancedText 1\.1|AdvancedTextPapiJo 1\.2)(?:\.\d+)?$/.test(description.library) ||
          !description.params || typeof description.params !== 'object' || Array.isArray(description.params)) {
        throw new Error(location + ': unrecognized description; original content must be retained.');
      }
      var params = description.params;
      if (params.text !== undefined && typeof params.text !== 'string') {
        throw new Error(location + ': description text is not a string; safe extraction is impossible.');
      }
      var text = params.text === undefined ? '' : params.text;
      var papiJo = /^H5P\.AdvancedTextPapiJo /.test(description.library);
      if (!papiJo && Object.keys(params).some(function (key) {
        return key !== 'text' && !(key === 'tooltipImages' &&
          Array.isArray(params[key]) && params[key].length === 0);
      })) {
        throw new Error(location + ': unknown ordinary Text parameters; original content must be retained.');
      }
      // PapiJo conversion is intentionally lossy: extract only visible body text.
      // Replacing the entire wrapper drops all tooltip/image/extra parameters.
      replacements.push({ slide: slide, text: papiJo ? htmlToPlainText(text) : text });
    }

    try {
      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) ||
          (parameters.timelineItems !== undefined && !Array.isArray(parameters.timelineItems))) {
        throw new Error('Unrecognized Timeline parameter structure.');
      }
      inspect(parameters.titleSlide, 'titleSlide.description');
      (parameters.timelineItems || []).forEach(function (slide, index) {
        inspect(slide, 'timelineItems[' + index + '].description');
      });
    }
    catch (error) {
      finished({ type: 'errorParamsBroken', message: error.message });
      return;
    }

    replacements.forEach(function (replacement) {
      replacement.slide.description = replacement.text;
    });
    finished(null, parameters);
  }

  return { 1: { 2: upgradeDescriptions } };
})();
