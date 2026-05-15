'use strict';

const crypto = require('crypto');
const tls = require('tls');

const JA3_SIGNATURES = {
  chrome_120: {
    ciphers: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
    ],
    extensions: [0, 11, 10, 35, 16, 5, 13, 18, 51, 45, 43, 27, 65281],
    curves: [29, 23, 24],
    pointFormats: [0],
    versions: [772, 771],
    sigalgs: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedVersions: [772, 771, 770, 769],
    pskKeyExchangeModes: [1],
    signatureAlgorithmsCert: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedGroups: [29, 23, 24, 25, 26, 27, 28, 30, 22, 21, 19, 256, 257, 258, 259, 260],
    applicationLayerProtocolNegotiation: ['h2', 'http/1.1'],
  },
  chrome_121: {
    ciphers: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
    ],
    extensions: [0, 11, 10, 35, 16, 5, 13, 18, 51, 45, 43, 27, 65281],
    curves: [29, 23, 24],
    pointFormats: [0],
    versions: [772, 771],
    sigalgs: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedVersions: [772, 771, 770, 769],
    pskKeyExchangeModes: [1],
    signatureAlgorithmsCert: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedGroups: [29, 23, 24, 25, 26, 27, 28, 30, 22, 21, 19, 256, 257, 258, 259, 260],
    applicationLayerProtocolNegotiation: ['h2', 'http/1.1'],
  },
  firefox_121: {
    ciphers: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
    ],
    extensions: [0, 10, 11, 13, 16, 35, 5, 18, 51, 45, 43, 27, 65281, 23],
    curves: [29, 23, 24],
    pointFormats: [0],
    versions: [772, 771],
    sigalgs: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedVersions: [772, 771, 770, 769],
    pskKeyExchangeModes: [1],
    signatureAlgorithmsCert: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedGroups: [29, 23, 24],
    applicationLayerProtocolNegotiation: ['h2', 'http/1.1'],
  },
  edge_120: {
    ciphers: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
    ],
    extensions: [0, 11, 10, 35, 16, 5, 13, 18, 51, 45, 43, 27, 65281],
    curves: [29, 23, 24],
    pointFormats: [0],
    versions: [772, 771],
    sigalgs: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedVersions: [772, 771, 770, 769],
    pskKeyExchangeModes: [1],
    signatureAlgorithmsCert: [1027, 2052, 1025, 1283, 2053, 1281, 2054, 1537, 513],
    supportedGroups: [29, 23, 24, 25, 26, 27, 28, 30, 22, 21, 19, 256, 257, 258, 259, 260],
    applicationLayerProtocolNegotiation: ['h2', 'http/1.1'],
  }
};

function getTLSOptions(browserBrand = 'chrome', version = '120') {
  const key = `${browserBrand}_${version}`;
  const sig = JA3_SIGNATURES[key] || JA3_SIGNATURES.chrome_120;
  return {
    ciphers: sig.ciphers.join(':'),
    sigalgs: sig.sigalgs ? sig.sigalgs.join(':') : undefined,
    curves: sig.curves ? sig.curves.join(':') : undefined,
  };
}

function generateJA3Hash(clientHello) {
  const parts = [];
  parts.push(clientHello.version || '772');
  parts.push(clientHello.ciphers?.join('-') || '');
  parts.push(clientHello.extensions?.join('-') || '');
  parts.push(clientHello.curves?.join('-') || '');
  parts.push(clientHello.pointFormats?.join('-') || '');
  const ja3String = parts.join(',');
  return crypto.createHash('md5').update(ja3String).digest('hex');
}

function createTLSContext(options = {}) {
  const browserBrand = options.browserBrand || 'chrome';
  const version = options.version || '120';
  const tlsOpts = getTLSOptions(browserBrand, version);
  const context = tls.createSecureContext({
    ciphers: tlsOpts.ciphers,
    sigalgs: tlsOpts.sigalgs,
    ecdhCurve: tlsOpts.curves,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
  });
  return { context, options: tlsOpts };
}

function getHTTPHeaders(browserBrand = 'chrome', version = '120', platform = 'windows') {
  const headers = {};
  if (browserBrand === 'chrome') {
    headers['sec-ch-ua'] = `"Not_A Brand";v="8", "Chromium";v="${version}", "Google Chrome";v="${version}"`;
    headers['sec-ch-ua-mobile'] = '?0';
    headers['sec-ch-ua-platform'] = `"${platform === 'windows' ? 'Windows' : platform === 'macos' ? 'macOS' : 'Linux'}"`;
    headers['sec-fetch-dest'] = 'document';
    headers['sec-fetch-mode'] = 'navigate';
    headers['sec-fetch-site'] = 'none';
    headers['sec-fetch-user'] = '?1';
    headers['upgrade-insecure-requests'] = '1';
  } else if (browserBrand === 'firefox') {
    headers['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    headers['accept-language'] = 'en-US,en;q=0.5';
    headers['accept-encoding'] = 'gzip, deflate, br';
    headers['upgrade-insecure-requests'] = '1';
    headers['sec-fetch-dest'] = 'document';
    headers['sec-fetch-mode'] = 'navigate';
    headers['sec-fetch-site'] = 'none';
    headers['sec-fetch-user'] = '?1';
  } else if (browserBrand === 'edge') {
    headers['sec-ch-ua'] = `"Not_A Brand";v="8", "Chromium";v="${version}", "Microsoft Edge";v="${version}"`;
    headers['sec-ch-ua-mobile'] = '?0';
    headers['sec-ch-ua-platform'] = `"${platform === 'windows' ? 'Windows' : platform === 'macos' ? 'macOS' : 'Linux'}"`;
    headers['sec-fetch-dest'] = 'document';
    headers['sec-fetch-mode'] = 'navigate';
    headers['sec-fetch-site'] = 'none';
    headers['sec-fetch-user'] = '?1';
    headers['upgrade-insecure-requests'] = '1';
  }
  return headers;
}

module.exports = {
  JA3_SIGNATURES,
  getTLSOptions,
  generateJA3Hash,
  createTLSContext,
  getHTTPHeaders,
};
