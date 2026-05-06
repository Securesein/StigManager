const CONFIDENCE = {
  VULN_ID: 1.0,
  STIG_ID: 0.95,
  TITLE:   0.85,
};

const FUZZY_THRESHOLD = 0.75;

const ANNOTATION_STATUS = {
  COMPLY:  'comply',
  EXPLAIN: 'explain',
  NA:      'na',
  OPEN:    'open',
};

const PLATFORMS = {
  IOS:                'iOS',
  ANDROID_ENTERPRISE: 'Android Enterprise',
};

const EXPIRY_WARNING_DAYS = 30;

module.exports = { CONFIDENCE, FUZZY_THRESHOLD, ANNOTATION_STATUS, PLATFORMS, EXPIRY_WARNING_DAYS };
