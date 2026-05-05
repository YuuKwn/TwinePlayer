const MAX_SCENE_TEXT_LENGTH = 10000;
const MAX_IMAGE_PROMPT_LENGTH = 5000;
const MAX_MODEL_NAME_LENGTH = 256;
const MAX_PROMPT_ID_LENGTH = 128;

const assertString = (value, label, maxLength = Infinity) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }

  if (value.length > maxLength) {
    throw new Error(`${label} is too long`);
  }

  return value.trim();
};

const assertPlainObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
};

const assertPromptId = (value) => {
  const promptId = assertString(value, 'Prompt ID', MAX_PROMPT_ID_LENGTH);
  if (!/^[A-Za-z0-9_-]+$/.test(promptId)) {
    throw new Error('Prompt ID contains unsupported characters');
  }

  return promptId;
};

const getErrorMessage = (err) => err instanceof Error ? err.message : String(err);

module.exports = {
  MAX_IMAGE_PROMPT_LENGTH,
  MAX_MODEL_NAME_LENGTH,
  MAX_SCENE_TEXT_LENGTH,
  assertPlainObject,
  assertPromptId,
  assertString,
  getErrorMessage,
};
