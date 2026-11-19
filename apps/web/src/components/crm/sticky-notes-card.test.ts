import { describe, expect, it } from "vitest";
import { getNoteDisplayTitle, orderNoteBlocksNewestFirst, parseNoteBlock } from "./sticky-notes-card";

describe("parseNoteBlock", () => {
  it("uses a saved note name and removes its storage marker from the content", () => {
    expect(parseNoteBlock(
      "Note 4: (A) - (January 04, 2026 10:00:00 AM):\n[[CRM_NOTE_TITLE]]Call back\nDiscussed the next steps.",
    )).toEqual({
      number: "4",
      title: "Call back",
      author: "A",
      timestamp: "January 04, 2026 10:00:00 AM",
      content: "Discussed the next steps.",
    });
  });

  it("keeps older numbered notes without a saved name", () => {
    expect(parseNoteBlock("Note 4: (A) - (date):\nLegacy note")).toMatchObject({
      number: "4",
      title: undefined,
      content: "Legacy note",
    });
  });
});

describe("getNoteDisplayTitle", () => {
  it("labels site visit and follow-up process notes by activity type", () => {
    const siteVisit = "Note 5: (Admin) - (date):\nSite visit completed: SV000150";
    const followUp = "Note 6: (Admin) - (date):\nFollow-up scheduled: FU000025";
    expect(getNoteDisplayTitle(parseNoteBlock(siteVisit), siteVisit))
      .toBe("Site Visit Notes");
    expect(getNoteDisplayTitle(parseNoteBlock(followUp), followUp))
      .toBe("Follow-up Notes");
  });

  it("uses a custom name or the note's first line instead of a numbered label", () => {
    expect(getNoteDisplayTitle(parseNoteBlock(
      "Note 4: (A) - (date):\n[[CRM_NOTE_TITLE]]Call back\nDiscussed the next steps.",
    ), ""))
      .toBe("Call back");
    const legacy = "Note 3: (A) - (date):\nLead details updated";
    expect(getNoteDisplayTitle(parseNoteBlock(legacy), legacy))
      .toBe("Lead details updated");
  });
});

describe("orderNoteBlocksNewestFirst", () => {
  it("orders numbered notes newest first while keeping legacy blocks intact", () => {
    const notes = [
      "Legacy note without metadata",
      "Note 1: (A) - (January 01, 2026 10:00:00 AM):\nfirst",
      "Note 3: (C) - (January 03, 2026 10:00:00 AM):\nthird",
      "Note 2: (B) - (January 02, 2026 10:00:00 AM):\nsecond",
    ].join("\n\n");

    expect(orderNoteBlocksNewestFirst(notes)).toEqual([
      "Note 3: (C) - (January 03, 2026 10:00:00 AM):\nthird",
      "Note 2: (B) - (January 02, 2026 10:00:00 AM):\nsecond",
      "Note 1: (A) - (January 01, 2026 10:00:00 AM):\nfirst",
      "Legacy note without metadata",
    ]);
  });

  it("preserves stable order for legacy notes and equal note numbers", () => {
    expect(orderNoteBlocksNewestFirst("legacy note\n\nNote 1: (A) - (date):\nfirst\n\nNote 2: (B) - (date):\nsecond")).toEqual([
      "Note 2: (B) - (date):\nsecond",
      "Note 1: (A) - (date):\nfirst",
      "legacy note",
    ]);
    expect(orderNoteBlocksNewestFirst("")).toEqual([]);
  });
});
