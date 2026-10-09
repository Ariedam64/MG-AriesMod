// Whether the running build is behind the latest release, which puts a badge
// on the Settings dock button.
import { check, checkEqual, done } from "./_check";
import { versionStatusOf } from "../src/platform/modVersion";

check("an older build is behind", versionStatusOf("3.1.0", { version: "3.2.0", download: "u" }).behind);
check("the latest build is not behind", !versionStatusOf("3.2.0", { version: "3.2.0" }).behind);
check("an unreachable release check is not behind", !versionStatusOf("3.1.0", null).behind);
check("a blank remote version is not behind", !versionStatusOf("3.1.0", { version: "  " }).behind);
checkEqual("the download link comes with a newer release", versionStatusOf("3.1.0", { version: "3.2.0", download: "u" }).download, "u");
check("an unknown local build with a release to get is behind", versionStatusOf(undefined, { version: "3.2.0" }).behind);
done();
