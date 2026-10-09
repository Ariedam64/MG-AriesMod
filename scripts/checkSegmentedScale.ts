// The segmented highlight lines up with its button when the window is scaled
// by the menu size setting (getBoundingClientRect includes that scale).
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { checkEqual, done } from "./_check";
import { segmented } from "../src/ui/kit/segmented";

const seg = segmented([{ value: "a", label: "A" }, { value: "b", label: "B" }], "a");
const [rail, first, second] = seg.children as unknown as HTMLElement[];
// Laid out 200px wide, drawn at 150%: every rect is 1.5 times its layout size.
const rect = (left: number, width: number) => () => ({ left, width, right: left + width, top: 0, bottom: 30, height: 30 }) as DOMRect;
Object.assign(seg, { getBoundingClientRect: rect(0, 300), offsetWidth: 200 });
Object.assign(first, { getBoundingClientRect: rect(0, 150) });
Object.assign(second, { getBoundingClientRect: rect(150, 150) });

seg.set("b");
checkEqual("the highlight starts where the button does, in layout pixels", rail.style.transform, "translate3d(100px,0,0)");
checkEqual("the highlight is as wide as the button, in layout pixels", rail.style.width, "100px");
done();
