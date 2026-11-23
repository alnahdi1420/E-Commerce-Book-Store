import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, newToken, type Db } from "./harness";

let db: Db;
let alice: string; // owner of workspace A
let bob: string; // owner of workspace B (stranger to A)
let carol: string; // invited viewer in A
let wsA: string;
let wsB: string;
let eventA: string;
const guests: { id: string; name: string; phone: string; token: string; hash: string }[] = [];

async function wsOf(user: string) {
  const [row] = await db.q<{ workspace_id: string }>(
    `select workspace_id from public.workspace_members where user_id = $1 and role = 'owner'`,
    [user],
  );
  return row.workspace_id;
}

beforeAll(async () => {
  db = await createDb();
  alice = await db.createUser("alice@example.com");
  bob = await db.createUser("bob@example.com");
  carol = await db.createUser("carol@example.com");
  wsA = await wsOf(alice);
  wsB = await wsOf(bob);

  eventA = await db.as(alice, async () => {
    const [e] = await db.q<{ id: string }>(
      `insert into public.events (workspace_id, title, starts_at, host_name, location_url, max_companions, allow_change)
       values ($1, 'حفل عشاء', now() + interval '7 days', 'أبو جعفر', 'https://maps.app.goo.gl/abc', 2, true) returning id`,
      [wsA],
    );
    return e.id;
  });

  const people = [
    ["أحمد", "+966501234567"],
    ["سارة", "+966502345678"],
    ["خالد", "+966503456789"],
    ["نورة", "+966504567890"],
    ["فهد", "+966505678901"],
  ];
  for (const [name, phone] of people) {
    const t = newToken();
    guests.push({ id: randomUUID(), name, phone, token: t.token, hash: t.hash });
  }
  await db.as(alice, () =>
    db.q(`select public.add_guests($1, $2::jsonb)`, [
      eventA,
      JSON.stringify(guests.map((g) => ({ id: g.id, name: g.name, phone: g.phone, token_hash: g.hash }))),
    ]),
  );
});

describe("signup bootstrap", () => {
  it("creates a personal workspace with the user as owner", async () => {
    expect(wsA).toBeTruthy();
    expect(wsB).toBeTruthy();
    expect(wsA).not.toEqual(wsB);
    const [p] = await db.q<{ plan_id: string }>(`select plan_id from public.workspaces where id = $1`, [wsA]);
    expect(p.plan_id).toBe("free");
  });
});

describe("tenant isolation", () => {
  it("owner sees own event and guests", async () => {
    const rows = await db.as(alice, () => db.q(`select id from public.event_guests where event_id = $1`, [eventA]));
    expect(rows).toHaveLength(5);
  });

  it("a stranger cannot read another workspace's events, guests, members or stats", async () => {
    await db.as(bob, async () => {
      expect(await db.q(`select id from public.events where id = $1`, [eventA])).toHaveLength(0);
      expect(await db.q(`select id from public.event_guests where event_id = $1`, [eventA])).toHaveLength(0);
      expect(await db.q(`select * from public.workspace_members where workspace_id = $1`, [wsA])).toHaveLength(0);
      expect(await db.q(`select * from public.event_stats where event_id = $1`, [eventA])).toHaveLength(0);
      expect(await db.q(`select * from public.workspaces where id = $1`, [wsA])).toHaveLength(0);
    });
  });

  it("a stranger cannot write into another workspace (even with a forged id)", async () => {
    await db.as(bob, async () => {
      await expect(
        db.q(`insert into public.events (workspace_id, title, starts_at, host_name) values ($1, 'x', now(), 'x')`, [wsA]),
      ).rejects.toThrow();
      await expect(
        db.q(`select public.add_guests($1, $2::jsonb)`, [
          eventA,
          JSON.stringify([{ id: randomUUID(), name: "دخيل", phone: "+966509999999", token_hash: newToken().hash }]),
        ]),
      ).rejects.toThrow(/FORBIDDEN/);
      await expect(db.q(`select public.set_guest_rsvp($1, 'attending', 0)`, [guests[0].id])).rejects.toThrow(/FORBIDDEN/);
      await expect(db.q(`select * from public.guest_phones($1)`, [eventA])).rejects.toThrow(/FORBIDDEN/);
      await expect(db.q(`select public.clone_event($1)`, [eventA])).rejects.toThrow(/FORBIDDEN/);
      const upd = await db.q(`update public.events set title = 'hacked' where id = $1 returning id`, [eventA]);
      expect(upd).toHaveLength(0);
      const del = await db.q(`delete from public.event_guests where event_id = $1 returning id`, [eventA]);
      expect(del).toHaveLength(0);
    });
  });

  it("phone numbers and token hashes are not readable through plain SELECT", async () => {
    await db.as(alice, async () => {
      await expect(db.q(`select phone_e164 from public.event_guests limit 1`)).rejects.toThrow(/permission denied/);
      await expect(db.q(`select token_hash from public.event_guests limit 1`)).rejects.toThrow(/permission denied/);
      const phones = await db.q<{ phone_e164: string }>(`select * from public.guest_phones($1)`, [eventA]);
      expect(phones.map((p) => p.phone_e164)).toContain("+966501234567");
    });
  });

  it("users cannot upgrade their own plan or make themselves platform admin", async () => {
    await db.as(alice, async () => {
      await expect(db.q(`update public.workspaces set plan_id = 'org' where id = $1`, [wsA])).rejects.toThrow();
      await expect(db.q(`insert into public.platform_admins (user_id) values ($1)`, [alice])).rejects.toThrow();
      await expect(db.q(`select public.admin_overview()`)).rejects.toThrow(/FORBIDDEN/);
      await expect(
        db.q(`select public.admin_set_workspace($1, 'org', false)`, [wsA]),
      ).rejects.toThrow(/FORBIDDEN/);
    });
  });

  it("anonymous visitors cannot read any table directly", async () => {
    await db.as(null, async () => {
      await expect(db.q(`select * from public.events`)).rejects.toThrow(/permission denied/);
      await expect(db.q(`select id from public.event_guests`)).rejects.toThrow(/permission denied/);
      await expect(db.q(`select * from public.event_stats`)).rejects.toThrow(/permission denied/);
      await expect(db.q(`select * from public.guest_phones($1)`, [eventA])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("guests", () => {
  it("skips duplicate phones within the same event and reports them", async () => {
    const res = await db.as(alice, () =>
      db.q<{ r: { inserted: number; skipped: { reason: string }[] } }>(`select public.add_guests($1, $2::jsonb) as r`, [
        eventA,
        JSON.stringify([{ id: randomUUID(), name: "أحمد مكرر", phone: "+966501234567", token_hash: newToken().hash }]),
      ]),
    );
    expect(res[0].r.inserted).toBe(0);
    expect(res[0].r.skipped[0].reason).toBe("duplicate");
  });

  it("tracks open vs. confirmed-sent separately and never invents delivery", async () => {
    await db.as(alice, async () => {
      await db.q(`select public.mark_guest_opened($1)`, [guests[0].id]);
      let [g] = await db.q<{ send_status: string; open_count: number }>(
        `select send_status, open_count from public.event_guests where id = $1`,
        [guests[0].id],
      );
      expect(g.send_status).toBe("opened");
      await db.q(`select public.mark_guest_sent($1, true)`, [guests[0].id]);
      await db.q(`select public.mark_guest_opened($1)`, [guests[0].id]); // re-open must not downgrade
      [g] = await db.q(`select send_status, open_count from public.event_guests where id = $1`, [guests[0].id]);
      expect(g.send_status).toBe("sent");
      expect(g.open_count).toBe(2);
      await db.q(`select public.mark_guest_sent($1, false)`, [guests[0].id]);
      [g] = await db.q(`select send_status, open_count from public.event_guests where id = $1`, [guests[0].id]);
      expect(g.send_status).toBe("opened");
      await db.q(`select public.mark_guest_sent($1, true)`, [guests[0].id]);
      const [e] = await db.q<{ status: string }>(`select status from public.events where id = $1`, [eventA]);
      expect(e.status).toBe("published");
    });
  });
});

describe("public RSVP", () => {
  it("returns only this guest's invitation, never phones or other guests", async () => {
    const [{ r }] = await db.as(null, () =>
      db.q<{ r: Record<string, unknown> }>(`select public.get_invitation($1) as r`, [guests[0].token]),
    );
    expect(r.guest_name).toBe("أحمد");
    const json = JSON.stringify(r);
    expect(json).not.toContain("+9665");
    expect(json).not.toContain("سارة");
    expect(json).not.toContain(guests[0].hash);
  });

  it("unknown or malformed tokens reveal nothing", async () => {
    await db.as(null, async () => {
      const [a] = await db.q<{ r: unknown }>(`select public.get_invitation($1) as r`, [newToken().token]);
      expect(a.r).toBeNull();
      const [b] = await db.q<{ r: unknown }>(`select public.get_invitation($1) as r`, ["short"]);
      expect(b.r).toBeNull();
      // The hash itself is not a valid token.
      const [c] = await db.q<{ r: unknown }>(`select public.get_invitation($1) as r`, [guests[0].hash]);
      expect(c.r).toBeNull();
      const [d] = await db.q<{ r: { ok: boolean; error: string } }>(
        `select public.submit_rsvp($1, 'attending', 0, null) as r`,
        [newToken().token],
      );
      expect(d.r).toEqual({ ok: false, error: "not_found" });
    });
  });

  it("attending / declined update stats exactly, companions are clamped", async () => {
    await db.as(null, async () => {
      const [a] = await db.q<{ r: { ok: boolean; companions: number } }>(
        `select public.submit_rsvp($1, 'attending', 9, 'ip1') as r`,
        [guests[0].token],
      );
      expect(a.r.ok).toBe(true);
      expect(a.r.companions).toBe(2); // max_companions = 2
      await db.q(`select public.submit_rsvp($1, 'declined', 3, 'ip2')`, [guests[1].token]);
    });
    const [s] = await db.as(alice, () =>
      db.q<{ total: number; attending: number; declined: number; pending: number; expected_people: number }>(
        `select * from public.event_stats where event_id = $1`,
        [eventA],
      ),
    );
    expect(s).toMatchObject({ total: 5, attending: 1, declined: 1, pending: 3, expected_people: 3 });
  });

  it("guest may change the answer when allowed, and is locked when not", async () => {
    await db.as(null, async () => {
      const [r] = await db.q<{ r: { ok: boolean } }>(`select public.submit_rsvp($1, 'declined', 0, 'ip1') as r`, [
        guests[0].token,
      ]);
      expect(r.r.ok).toBe(true);
    });
    await db.as(alice, () => db.q(`update public.events set allow_change = false where id = $1`, [eventA]));
    await db.as(null, async () => {
      const [r] = await db.q<{ r: { ok: boolean; error: string } }>(
        `select public.submit_rsvp($1, 'attending', 0, 'ip1') as r`,
        [guests[0].token],
      );
      expect(r.r).toEqual({ ok: false, error: "locked" });
    });
    await db.as(alice, () => db.q(`update public.events set allow_change = true where id = $1`, [eventA]));
  });

  it("rejects responses after the deadline or for cancelled events", async () => {
    await db.as(alice, () =>
      db.q(`update public.events set rsvp_deadline = now() - interval '1 minute' where id = $1`, [eventA]),
    );
    await db.as(null, async () => {
      const [r] = await db.q<{ r: { error: string } }>(`select public.submit_rsvp($1, 'attending', 0, 'x') as r`, [
        guests[2].token,
      ]);
      expect(r.r.error).toBe("deadline");
    });
    await db.as(alice, () =>
      db.q(`update public.events set rsvp_deadline = null, status = 'cancelled' where id = $1`, [eventA]),
    );
    await db.as(null, async () => {
      const [r] = await db.q<{ r: { error: string } }>(`select public.submit_rsvp($1, 'attending', 0, 'x') as r`, [
        guests[2].token,
      ]);
      expect(r.r.error).toBe("closed");
    });
    await db.as(alice, () => db.q(`update public.events set status = 'published' where id = $1`, [eventA]));
  });

  it("rate-limits a single client key", async () => {
    const results = await db.as(null, async () => {
      const out: boolean[] = [];
      for (let i = 0; i < 65; i++) {
        const [r] = await db.q<{ r: { ok: boolean } }>(`select public.submit_rsvp($1, 'attending', 0, 'flood') as r`, [
          newToken().token,
        ]);
        out.push((r.r as { error?: string }).error === "rate_limited");
      }
      return out;
    });
    expect(results.filter(Boolean).length).toBeGreaterThan(0);
  });

  it("organizer manual update is audited with its source and actor", async () => {
    await db.as(alice, () => db.q(`select public.set_guest_rsvp($1, 'attending', 1)`, [guests[3].id]));
    const audit = await db.as(alice, () =>
      db.q<{ source: string; actor_user_id: string; new_status: string }>(
        `select source, actor_user_id, new_status from public.rsvp_audit where guest_id = $1 order by id desc limit 1`,
        [guests[3].id],
      ),
    );
    expect(audit[0]).toMatchObject({ source: "organizer", actor_user_id: alice, new_status: "attending" });
    const [g] = await db.as(alice, () =>
      db.q<{ response_source: string }>(`select response_source from public.event_guests where id = $1`, [guests[3].id]),
    );
    expect(g.response_source).toBe("organizer");
  });
});

describe("team invitations & roles", () => {
  let token: string;
  it("owner invites a viewer; wrong email cannot accept; right email can", async () => {
    const t = newToken();
    token = t.token;
    await db.as(alice, () =>
      db.q(
        `insert into public.workspace_invitations (workspace_id, email, role, token_hash, expires_at)
         values ($1, 'carol@example.com', 'viewer', $2, now() + interval '7 days')`,
        [wsA, t.hash],
      ),
    );
    await db.as(bob, async () => {
      await expect(db.q(`select public.accept_workspace_invitation($1)`, [token])).rejects.toThrow(/EMAIL_MISMATCH/);
    });
    const [r] = await db.as(carol, () =>
      db.q<{ ws: string }>(`select public.accept_workspace_invitation($1) as ws`, [token]),
    );
    expect(r.ws).toBe(wsA);
    await db.as(carol, async () => {
      await expect(db.q(`select public.accept_workspace_invitation($1)`, [token])).rejects.toThrow(/INVITE_INVALID/);
    });
  });

  it("viewer can see stats but cannot edit, send or read phones", async () => {
    await db.as(carol, async () => {
      expect(await db.q(`select * from public.event_stats where event_id = $1`, [eventA])).toHaveLength(1);
      await expect(db.q(`select * from public.guest_phones($1)`, [eventA])).rejects.toThrow(/FORBIDDEN/);
      await expect(db.q(`select public.mark_guest_opened($1)`, [guests[4].id])).rejects.toThrow(/FORBIDDEN/);
      const upd = await db.q(`update public.events set title = 'x' where id = $1 returning id`, [eventA]);
      expect(upd).toHaveLength(0);
      await expect(db.q(`select * from public.contacts`)).resolves.toHaveLength(0);
    });
  });

  it("a non-owner member cannot promote themselves or invite others", async () => {
    await db.as(carol, async () => {
      const upd = await db.q(
        `update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2 returning 1`,
        [wsA, carol],
      );
      expect(upd).toHaveLength(0);
      await expect(
        db.q(
          `insert into public.workspace_invitations (workspace_id, email, role, token_hash, expires_at)
           values ($1, 'x@example.com', 'organizer', $2, now() + interval '1 day')`,
          [wsA, newToken().hash],
        ),
      ).rejects.toThrow();
    });
  });

  it("owner can scope an organizer to specific events only", async () => {
    const dave = await db.createUser("dave@example.com");
    const otherEvent = await db.as(alice, async () => {
      const [e] = await db.q<{ id: string }>(
        `insert into public.events (workspace_id, title, starts_at, host_name) values ($1, 'اجتماع', now() + interval '3 days', 'x') returning id`,
        [wsA],
      );
      return e.id;
    });
    const t = newToken();
    await db.as(alice, () =>
      db.q(
        `insert into public.workspace_invitations (workspace_id, email, role, all_events, event_ids, token_hash, expires_at)
         values ($1, 'dave@example.com', 'organizer', false, $2::uuid[], $3, now() + interval '7 days')`,
        [wsA, `{${eventA}}`, t.hash],
      ),
    );
    await db.as(dave, () => db.q(`select public.accept_workspace_invitation($1)`, [t.token]));
    await db.as(dave, async () => {
      const visible = await db.q<{ id: string }>(`select id from public.events where workspace_id = $1`, [wsA]);
      expect(visible.map((v) => v.id)).toEqual([eventA]);
      await expect(db.q(`select * from public.guest_phones($1)`, [otherEvent])).rejects.toThrow(/FORBIDDEN/);
      await expect(db.q(`select * from public.guest_phones($1)`, [eventA])).resolves.toBeTruthy();
    });
  });
});

describe("plan limits (server-side)", () => {
  it("free plan blocks creating more active events than allowed", async () => {
    // Bob's workspace: free plan allows 3 active events.
    await db.as(bob, async () => {
      for (let i = 0; i < 3; i++) {
        await db.q(`insert into public.events (workspace_id, title, starts_at, host_name) values ($1, $2, now(), 'b')`, [
          wsB,
          `e${i}`,
        ]);
      }
      await expect(
        db.q(`insert into public.events (workspace_id, title, starts_at, host_name) values ($1, 'e4', now(), 'b')`, [wsB]),
      ).rejects.toThrow(/PLAN_LIMIT_EVENTS/);
    });
  });

  it("guest limit is enforced per event", async () => {
    await db.asSuper();
    await db.q(`update public.plans set max_guests_per_event = 6 where id = 'free'`);
    const res = await db.as(alice, () =>
      db.q<{ r: { inserted: number; skipped: { reason: string }[] } }>(`select public.add_guests($1, $2::jsonb) as r`, [
        eventA,
        JSON.stringify(
          ["+966506000001", "+966506000002"].map((phone) => ({
            id: randomUUID(),
            name: "ضيف",
            phone,
            token_hash: newToken().hash,
          })),
        ),
      ]),
    );
    expect(res[0].r.inserted).toBe(1);
    expect(res[0].r.skipped[0].reason).toBe("plan_limit");
    await db.q(`update public.plans set max_guests_per_event = 300 where id = 'free'`);
  });
});
