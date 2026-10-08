"""HTTP smoke tests; SimpleTestCase requires no database."""

from django.test import SimpleTestCase, override_settings


# Django's test runner disables DEBUG; these smoke tests exercise local serving.
@override_settings(ALLOWED_HOSTS=["testserver"], DEBUG=True)
class FoundationSmokeTests(SimpleTestCase):
    def test_frontend_document_and_module_reference(self):
        response = self.client.get("/")

        self.assertContains(response, "Space Boxes Timer V2 Foundation")
        self.assertEqual(response["Content-Type"], "text/html; charset=utf-8")
        self.assertInHTML(
            '<p id="v2-startup-status" role="status">Starting V2 frontend…</p>',
            response.content.decode(),
        )
        self.assertInHTML(
            '<script type="module" src="./js/app.js"></script>',
            response.content.decode(),
        )

    def test_javascript_is_served(self):
        response = self.client.get("/js/app.js")
        try:
            self.assertEqual(response.status_code, 200)
            self.assertIn(
                response["Content-Type"].split(";")[0],
                ("text/javascript", "application/javascript"),
            )
            self.assertTrue(b"".join(response.streaming_content))
        finally:
            response.close()

    def test_unknown_routes_return_not_found(self):
        for url in ("/unknown/", "/js/missing.js"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    @override_settings(DEBUG=False)
    def test_javascript_serving_is_development_only(self):
        self.assertEqual(self.client.get("/js/app.js").status_code, 404)
