// Installs the fake DOM as a side effect, for checks whose imports touch
// `window` or `document` while they load: import this first.
import { installFakeDom } from "./_fakeDom";

installFakeDom();
