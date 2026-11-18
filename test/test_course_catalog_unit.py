import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / "dojo_plugin/learning/course_catalog.py"
spec = importlib.util.spec_from_file_location("course_catalog", path)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class CourseCatalogTest(unittest.TestCase):
    def test_search_includes_full_description_and_preserves_global_counts(self):
        courses = [
            {"id": 1, "name": "First", "description": "x" * 321 + " 检索词",
             "counts": {"questions": {"needsAttention": 3}}},
            {"id": 2, "name": "Second", "counts": {}, "recentActivity": [{"updated": "2026-10-01"}]},
        ]
        result = catalog.page(courses, catalog.filters({"q": "检索词", "filter": "attention"}), 1, 1)
        self.assertEqual([item["id"] for item in result["items"]], [1])
        self.assertEqual(len(result["items"][0]["description"]), 320)
        self.assertEqual(result["counts"], dict(total=2, recent=1, attention=1, drafts=0, published=0))
        self.assertEqual(result["pagination"]["total"], 1)


if __name__ == "__main__":
    unittest.main()
