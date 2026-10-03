import { beforeEach, describe, expect, it, vi } from "vitest";
import VirtualJoystick from "./VirtualJoystick";

type FakeManager = { handlers: Record<string, (evt: unknown, data?: unknown) => void>; destroy: ReturnType<typeof vi.fn> };

// nipplejs builds its joysticks out of DOM, which node hasn't got - stand in a manager that records what's asked of it.
const managers = vi.hoisted(() => [] as unknown[]);
vi.mock("nipplejs", () => ({
    create: () => {
        const manager: FakeManager = {
            handlers: {},
            destroy: vi.fn(),
        };
        (manager as unknown as { on: unknown }).on = (event: string, handler: (evt: unknown, data?: unknown) => void) => {
            manager.handlers[event] = handler;
        };
        managers.push(manager);
        return manager;
    },
}));

beforeEach(() => {
    managers.length = 0;
});

describe("VirtualJoystick.Destroy", () => {
    it("destroys every joystick it made", () => {
        const joystick = new VirtualJoystick();
        joystick.Create();
        joystick.Create();

        joystick.Destroy();

        expect(managers).toHaveLength(2);
        (managers as FakeManager[]).forEach(manager => expect(manager.destroy).toHaveBeenCalledTimes(1));
    });

    it("is safe to call twice, and with none made", () => {
        const joystick = new VirtualJoystick();
        expect(() => joystick.Destroy()).not.toThrow();

        joystick.Create();
        joystick.Destroy();
        joystick.Destroy();

        expect((managers[0] as FakeManager).destroy).toHaveBeenCalledTimes(1);
    });
});

describe("VirtualJoystick state", () => {
    it("records the event type a dir event carries - not the page's current window.event", () => {
        const joystick = new VirtualJoystick();
        joystick.Create();

        (managers[0] as FakeManager).handlers.dir({ type: "dir:up" });

        const state = (joystick as unknown as { joysticks: { GetState(): { dir: string } }[] }).joysticks[0].GetState();
        expect(state.dir).toBe("dir:up");
    });
});
