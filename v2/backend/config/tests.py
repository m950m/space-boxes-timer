"""HTTP smoke tests; SimpleTestCase requires no database."""

from django.test import SimpleTestCase, override_settings


# Django's test runner disables DEBUG; these smoke tests exercise local serving.
@override_settings(ALLOWED_HOSTS=["testserver"], DEBUG=True)
class FoundationSmokeTests(SimpleTestCase):
    def test_frontend_document_and_module_reference(self):
        response = self.client.get("/")

        self.assertContains(response, "Local planner")
        self.assertEqual(response["Content-Type"], "text/html; charset=utf-8")
        self.assertInHTML(
            '<p id="v2-startup-status" role="status" aria-live="polite" '
            'aria-atomic="true">Loading local plans…</p>',
            response.content.decode(),
        )
        self.assertInHTML(
            '<script type="module" src="./js/app.js"></script>',
            response.content.decode(),
        )
        self.assertInHTML(
            '<link rel="stylesheet" href="./css/planner.css">',
            response.content.decode(),
        )

    def test_assets_are_served(self):
        for url, content_types in (
            ("/js/app.js", ("text/javascript", "application/javascript")),
            ("/css/planner.css", ("text/css",)),
        ):
            with self.subTest(url=url):
                response = self.client.get(url)
                try:
                    self.assertEqual(response.status_code, 200)
                    self.assertIn(response["Content-Type"].split(";")[0], content_types)
                    self.assertTrue(b"".join(response.streaming_content))
                finally:
                    response.close()

    def test_unknown_routes_return_not_found(self):
        for url in ("/unknown/", "/js/missing.js", "/css/missing.css"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    @override_settings(DEBUG=False)
    def test_asset_serving_is_development_only(self):
        for url in ("/js/app.js", "/css/planner.css"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)
