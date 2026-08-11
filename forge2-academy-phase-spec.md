# Forge 2 — "Academy" Module
## Phase Spec: Course / Lesson / Progress-Tracking Schema

---

## 1. Objective

Turn the Content Production Fundamentals course (and future courses) into a navigable, trackable in-app experience — not a static doc. Built to be generic enough that any future course (color grading, thumbnail design, channel growth, etc.) drops into the same schema without new tables.

---

## 2. Data Model (Drizzle / Postgres / Neon)

### `courses`
```
id              uuid pk
slug            text unique          -- 'content-production-fundamentals'
title           text
description     text
level           enum('beginner','intermediate','advanced')
estimated_minutes int
cover_image_url text
status          enum('draft','published','archived')
created_at      timestamptz
created_by      uuid fk -> users
```

### `modules`
Top-level groupings (Pre-Production / Production / Post-Production).
```
id              uuid pk
course_id       uuid fk -> courses
title           text
"order"         int                  -- display sequence
created_at      timestamptz
```

### `lessons`
Maps 1:1 to each numbered section (1.1, 1.2, 2.1, etc.) in the source course.
```
id              uuid pk
module_id       uuid fk -> modules
title           text
lesson_number   text                 -- '1.1', '1.2' etc, preserves source numbering
content_md      text                 -- lesson body, markdown
video_url       text nullable        -- linked later; lesson works fine without it (text-only) until set
video_provider  enum('mux','youtube_unlisted','vimeo','s3') nullable
video_duration_seconds int nullable
action_item     text                 -- the "Do This Now" line
estimated_minutes int
"order"         int
created_at      timestamptz
```

`video_url` is nullable by design — the course ships text-only now, and adding a video later is a single `UPDATE`, not a schema change or new lesson version. UI renders a video player above `content_md` only when `video_url` is present, otherwise the lesson is text-only exactly as it is today. Progress is never reset when a video is added — video is treated as supplementary, not a new version of the lesson.

### `lesson_video_notifications`
Tracks which users still need the "video added" notice for a lesson whose video just went live — avoids adding a mutable flag to `lessons` itself (which every reader would then need to interpret) and keeps this as its own small, easily-cleared queue.
```
id              uuid pk
lesson_id       uuid fk -> lessons
user_id         uuid fk -> users
workspace_id    uuid fk -> workspaces
seen            boolean default false
created_at      timestamptz          -- set when video_url first goes from null -> set
```
Populated for every user with `in_progress` or `completed` status on that lesson at the moment the video is added (new/not-yet-started learners just see the video normally, no notification needed since they haven't experienced the text-only version). Surfaced as a small badge/toast ("Video added to Lesson 2.3") the next time they open the lesson or land on the dashboard; `seen` flips true on view.

### `badges`
```
id              uuid pk
slug            text unique          -- 'content-production-fundamentals-complete'
title           text                 -- 'Production Fundamentals'
description     text
icon_url        text                 -- rendered from the shared badge template, not a one-off design
course_id       uuid fk -> courses nullable   -- badge tied to a specific course; nullable to allow
                                               -- future non-course badges (e.g. streaks, milestones)
created_at      timestamptz
```
With 3 courses already live, badges should share one visual system rather than being designed per-course: a single base shape/frame (e.g. shield, seal, or hex badge matching your dark industrial-luxury language — acid yellow or indigo accent ring), with only the icon glyph and label swapped per course. Practically this means `icon_url` points to a generated/composited asset (base frame + course-specific glyph), not an independently art-directed image each time. Worth building the 4th (this course's) badge against the same template as the existing 3 rather than treating it as a one-off — if the existing 3 don't share a template yet, this is a good point to retrofit them onto one.

### `user_badges`
```
id              uuid pk
user_id         uuid fk -> users
workspace_id    uuid fk -> workspaces
badge_id        uuid fk -> badges
awarded_at      timestamptz

unique(user_id, workspace_id, badge_id)
```
Awarded automatically the moment the last lesson in a course flips to `completed` — a DB trigger or a check in the `PATCH /lessons/:lessonId/progress` handler (application-level check is simpler to reason about than a trigger, and this write pattern is low-volume enough that it doesn't need DB-level enforcement).

### `course_access`
Admin-allocated, per team member, per course — access isn't open-by-default even within a workspace.
```
id              uuid pk
course_id       uuid fk -> courses
workspace_id    uuid fk -> workspaces
user_id         uuid fk -> users
granted_by      uuid fk -> users        -- the admin who allocated it
granted_at      timestamptz
revoked_at      timestamptz nullable    -- soft revoke, keeps history instead of deleting the row

unique(course_id, workspace_id, user_id)
```
A user only sees a course in their Academy index if a `course_access` row exists for them with `revoked_at IS NULL`. Admins/owners always have implicit access to every course in their workspace without needing a row — the table only governs non-admin members. **Revoking access resets progress**: the `DELETE /academy/access/:id` handler sets `revoked_at`, then deletes that user's `user_progress` rows for the course's lessons (and their `course_enrollments` row) in the same transaction. Any badge already earned is left untouched — a badge is a completed achievement, not part of "progress," so it survives a revoke even though the underlying progress data doesn't. Re-granting access afterward starts the course over from zero.

### `user_progress`
```
id              uuid pk
user_id         uuid fk -> users
workspace_id    uuid fk -> workspaces      -- progress is per-workspace, not just per-user,
                                            -- since Forge 2 users can belong to multiple workspaces
lesson_id       uuid fk -> lessons
status          enum('not_started','in_progress','completed')
action_item_completed boolean default false
completed_at    timestamptz
updated_at      timestamptz

unique(user_id, workspace_id, lesson_id)
```

### `course_enrollments`
Tracks who's actively working through a course (distinct from progress on individual lessons — lets you show "3 people on your team are taking this course" in an agency/client-portal context).
```
id              uuid pk
course_id       uuid fk -> courses
user_id         uuid fk -> users
workspace_id    uuid fk -> workspaces
enrolled_at     timestamptz
last_activity_at timestamptz
completed_at    timestamptz nullable
```

---

## 3. Derived Views (not tables — computed at query time)

- **Course completion %** — `completed lessons / total lessons` per (user, workspace, course)
- **Module completion %** — same, scoped to one module
- **"Continue where you left off"** — most recent `user_progress` row with `status = 'in_progress'`, ordered by `updated_at`

Avoid storing these as columns — they'd need constant recalculation triggers as lessons get added/edited. Compute on read; this table is small enough per user that it's cheap.

---

## 4. API Routes

```
GET    /api/academy/courses                          list courses visible to current user (access-filtered)
GET    /api/academy/courses/:slug                     course detail + modules + lessons (no content_md, summary only)
GET    /api/academy/courses/:slug/lessons/:lessonId    full lesson content (video_url included if set)

POST   /api/academy/courses/:slug/enroll               creates course_enrollments row
GET    /api/academy/courses/:slug/progress             current user's progress across all lessons in course

PATCH  /api/academy/lessons/:lessonId/progress          update status (in_progress/completed) — triggers
                                                          badge award check if this completes the course
PATCH  /api/academy/lessons/:lessonId/action-item       mark the "Do This Now" checked

GET    /api/users/me/badges                             all badges earned by current user, for dashboard display

GET    /api/workspaces/:wsId/academy/team-progress      agency view: all team members' progress (role-gated)
GET    /api/workspaces/:wsId/academy/access             list current course_access grants (admin-only)
POST   /api/workspaces/:wsId/academy/access             grant a member access to a course (admin-only)
DELETE /api/workspaces/:wsId/academy/access/:id          revoke access — sets revoked_at, clears progress

GET    /api/academy/notifications/video-added            unseen "video added" notices for current user
PATCH  /api/academy/notifications/video-added/:id/seen   dismiss a notice
```

All routes wrapped with existing `requireWorkspaceRole()`; the `team-progress` route additionally requires an admin/owner role, since it exposes other users' completion data.

---

## 5. UI Structure

- **Course index page** — card grid, filtered to courses the user has `course_access` for (or all, if admin); progress ring showing % complete for the current user
- **Course detail page** — sidebar with modules/lessons (checkmarks for completed), main pane renders video player (when `video_url` is set) above `content_md`, action item shown as a dismissible checklist card at the bottom of each lesson
- **"Continue" CTA** — surfaced on the Forge 2 dashboard home if the user has an `in_progress` course, deep-links straight to the next incomplete lesson
- **Dashboard progress + badges** — user's main dashboard shows active course progress bars and a badge shelf (earned badges, icon + title); this is the primary surfacing point per your note, not just buried inside the Academy section itself
- **Admin access panel** — under workspace settings, a table of team members × available courses, toggle-style grant/revoke per cell, reusing the same permission pattern as your other admin dashboards. Admins see all courses without needing explicit grants; this panel is for allocating access to everyone else
- **Badge award moment** — completing the final lesson triggers a small celebratory toast/modal ("Badge earned: Production Fundamentals") rather than a silent DB write — it's the main reward mechanic for the course

---

## 6. Seeding the First Course

The Content Production Fundamentals doc maps directly:
- 1 `courses` row
- 3 `modules` rows (Pre-Production, Production, Post-Production)
- 20 `lessons` rows, one per numbered section, `content_md` = that section's body text, `action_item` = its "Do This Now" line, `video_url` left `null` for all 20 until footage is ready
- 1 `badges` row (`content-production-fundamentals-complete`) linked to the course

Seed script reads the source markdown, splits on `## N.N` headers, and inserts programmatically rather than hand-entering 20 rows — worth writing even for a one-time seed, since every future course follows the same split-on-headers pattern.

---

## 7. Build Order

1. Schema migration (`courses`, `modules`, `lessons`, `user_progress`, `course_enrollments`, `badges`, `user_badges`, `course_access`)
2. Seed script + run against the Content Production Fundamentals course, badge row included
3. Course index + detail routes and UI (video player conditional on `video_url`)
4. Progress tracking (mark lesson complete, action-item checkbox) + badge-award check on course completion
5. Dashboard surfacing: "Continue where you left off" + badge shelf
6. Admin access-allocation panel (grant/revoke per team member per course)
7. Agency team-progress view (admin-gated)

---

## 8. Resolved Decisions

- Video added later → progress is never reset; affected users get a dismissible "video added" notice instead (see `lesson_video_notifications`).
- Badges share one visual template (base frame + swappable glyph/label) across all courses, including the 3 already live — worth retrofitting those onto the same template if they don't already share one.
- Revoking `course_access` clears the member's progress and enrollment for that course; a previously earned badge is unaffected.
