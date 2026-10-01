"""Automated tests for Campus Connect. Run: python -m unittest test_app -v"""
import os
import tempfile
import unittest

import app as campus


class CampusConnectTests(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        campus.DB = self.path
        campus.init_db()
        campus.app.config["TESTING"] = True
        self.c = campus.app.test_client()

    def tearDown(self):
        os.remove(self.path)

    # helpers
    def register(self, email="stu@campus.edu", pw="secret1", name="Stu"):
        return self.c.post("/api/register", json={"name": name, "email": email, "password": pw, "department": "CS"})

    def login(self, email="stu@campus.edu", pw="secret1"):
        return self.c.post("/api/login", json={"email": email, "password": pw})

    def admin(self):
        return self.login("admin@campus.edu", "admin123")

    # T1-T4 registration
    def test_t01_register_valid(self):
        self.assertEqual(self.register().status_code, 201)

    def test_t02_register_duplicate(self):
        self.register()
        self.assertEqual(self.register().status_code, 409)

    def test_t03_register_bad_email(self):
        self.assertEqual(self.register(email="abc").status_code, 400)

    def test_t04_register_short_password(self):
        self.assertEqual(self.register(pw="123").status_code, 400)

    # T5-T6 login
    def test_t05_login_valid(self):
        self.register()
        r = self.login()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["role"], "student")

    def test_t06_login_wrong_password(self):
        self.register()
        self.assertEqual(self.login(pw="wrongpw").status_code, 401)

    # T7-T9 notices and access control
    def test_t07_notices_need_login(self):
        self.assertEqual(self.c.get("/api/notices").status_code, 401)

    def test_t08_student_cannot_post_notice(self):
        self.register(); self.login()
        r = self.c.post("/api/notices", json={"title": "x", "body": "y"})
        self.assertEqual(r.status_code, 403)

    def test_t09_admin_posts_and_deletes_notice(self):
        self.admin()
        self.assertEqual(self.c.post("/api/notices", json={"title": "Exam", "body": "Monday", "category": "Exam"}).status_code, 201)
        n = self.c.get("/api/notices").get_json()
        self.assertEqual(len(n), 1)
        self.assertEqual(self.c.delete(f"/api/notices/{n[0]['id']}").status_code, 200)
        self.assertEqual(self.c.get("/api/notices").get_json(), [])

    # T10-T11 events
    def test_t10_rsvp_toggle(self):
        self.admin()
        self.c.post("/api/events", json={"title": "Fest", "event_date": "2026-12-01", "venue": "Hall"})
        self.c.post("/api/logout")
        self.register(); self.login()
        eid = self.c.get("/api/events").get_json()[0]["id"]
        self.c.post(f"/api/events/{eid}/rsvp")
        self.assertEqual(self.c.get("/api/events").get_json()[0]["attendees"], 1)
        self.c.post(f"/api/events/{eid}/rsvp")
        self.assertEqual(self.c.get("/api/events").get_json()[0]["attendees"], 0)

    def test_t11_invalid_event_date(self):
        self.admin()
        r = self.c.post("/api/events", json={"title": "Fest", "event_date": "12-2026"})
        self.assertEqual(r.status_code, 400)

    # T12-T14 lost and found
    def test_t12_post_item(self):
        self.register(); self.login()
        r = self.c.post("/api/items", json={"kind": "lost", "item": "Wallet", "contact": "99999"})
        self.assertEqual(r.status_code, 201)

    def test_t13_invalid_item_kind(self):
        self.register(); self.login()
        r = self.c.post("/api/items", json={"kind": "stolen", "item": "Bag", "contact": "1"})
        self.assertEqual(r.status_code, 400)

    def test_t14_non_owner_cannot_resolve(self):
        self.register(); self.login()
        self.c.post("/api/items", json={"kind": "lost", "item": "Key", "contact": "1"})
        iid = self.c.get("/api/items").get_json()[0]["id"]
        self.c.post("/api/logout")
        self.register(email="other@campus.edu"); self.login("other@campus.edu")
        self.assertEqual(self.c.post(f"/api/items/{iid}/resolve").status_code, 403)
        self.c.post("/api/logout"); self.login()
        self.assertEqual(self.c.post(f"/api/items/{iid}/resolve").status_code, 200)

    # T15-T16 security
    def test_t15_sql_injection_login(self):
        self.register()
        r = self.c.post("/api/login", json={"email": "' OR 1=1 --", "password": "x"})
        self.assertEqual(r.status_code, 401)

    def test_t16_password_is_hashed(self):
        self.register()
        import sqlite3
        pw = sqlite3.connect(self.path).execute("SELECT password FROM users WHERE email='stu@campus.edu'").fetchone()[0]
        self.assertNotEqual(pw, "secret1")

    def test_t17_overlong_input_rejected(self):
        self.admin()
        r = self.c.post("/api/notices", json={"title": "t" * 500, "body": "b"})
        self.assertEqual(r.status_code, 400)

    def test_t18_missing_body_rejected(self):
        self.admin()
        r = self.c.post("/api/notices", json={"title": "only title"})
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()
