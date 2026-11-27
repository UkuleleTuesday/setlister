// #152 on the client: what a room phone writes, what a refused room write
// does, and how an organiser phone's stored status survives boot.
import { afterEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({
  getSessionId: vi.fn(() => "misty-banjo"),
  notifyLocalChange: vi.fn(),
  refresh: vi.fn(() => Promise.resolve()),
}));
const firebase = vi.hoisted(() => ({ getAuth: vi.fn(), getFirestore: vi.fn() }));
vi.mock("../sync.js", async (original) => ({ ...(await original<object>()), ...sync }));
vi.mock("../firebase.js", () => firebase);
vi.mock("../api.js", () => ({ API_BASE: "" }));

const { persist } = await import("../save.js");
const { sendRoomWrite } = await import("../room-writes.js");
const { restoreOrganiser } = await import("../organiser.svelte.js");
const { organiserStatus, setOrganiser } = await import("../organiser-status.svelte.js");
const { notices } = await import("../notices.svelte.js");

afterEach(() => {
  vi.clearAllMocks();
});

describe("persist", () => {
  it("pushes the list diff from an organiser's phone, never a room phone's", () => {
    setOrganiser(false);
    persist();
    expect(sync.notifyLocalChange).not.toHaveBeenCalled();

    setOrganiser(true);
    persist();
    expect(sync.notifyLocalChange).toHaveBeenCalledTimes(1);
  });
});

describe("sendRoomWrite", () => {
  it("says so and resyncs when the write is refused", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    sendRoomWrite(Promise.reject({ code: "permission-denied" }), "Couldn’t add that request.");
    await vi.waitFor(() => expect(sync.refresh).toHaveBeenCalledTimes(1));
    expect(notices.requests.text).toBe("Couldn’t add that request.");
  });

  it("does nothing more when the write lands", async () => {
    sendRoomWrite(Promise.resolve(), "Couldn’t add that request.");
    await Promise.resolve();
    expect(sync.refresh).not.toHaveBeenCalled();
  });
});

describe("restoreOrganiser", () => {
  const signedIn = (row: { name: string } | null) => {
    firebase.getAuth.mockResolvedValue({ auth: { currentUser: { uid: "u1" } } });
    firebase.getFirestore.mockResolvedValue({
      db: {},
      fx: {
        doc: () => ({}),
        getDoc: async () => ({ exists: () => row !== null, data: () => row ?? undefined }),
      },
    });
  };

  it("keeps the stored status when offline", async () => {
    setOrganiser(true);
    firebase.getAuth.mockRejectedValue(new Error("offline"));
    await restoreOrganiser();
    expect(organiserStatus.isOrganiser).toBe(true);
  });

  it("drops it when the sign-in is gone", async () => {
    setOrganiser(true);
    firebase.getAuth.mockResolvedValue({ auth: { currentUser: null } });
    firebase.getFirestore.mockResolvedValue({ db: {}, fx: {} });
    await restoreOrganiser();
    expect(organiserStatus.isOrganiser).toBe(false);
  });

  it("drops it when the row is gone, and keeps it with the row's name otherwise", async () => {
    setOrganiser(true);
    signedIn(null);
    await restoreOrganiser();
    expect(organiserStatus.isOrganiser).toBe(false);

    setOrganiser(true);
    signedIn({ name: "Alex" });
    await restoreOrganiser();
    expect(organiserStatus).toMatchObject({ isOrganiser: true, name: "Alex" });
  });

  it("asks nothing of a phone that never registered", async () => {
    setOrganiser(false);
    await restoreOrganiser();
    expect(firebase.getAuth).not.toHaveBeenCalled();
  });
});
