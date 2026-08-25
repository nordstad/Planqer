// jsdom doesn't provide these; react-router-dom needs them to load at all.
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

require("@testing-library/jest-dom");
