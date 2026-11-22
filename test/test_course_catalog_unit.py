import ast
from collections import defaultdict
import importlib.util
from pathlib import Path
from types import SimpleNamespace
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


    def test_legacy_question_queries_are_batched_within_the_managed_courses(self):
        from sqlalchemy import Column, ForeignKey, Integer, String, create_engine, event
        from sqlalchemy.orm import declarative_base, joinedload, relationship, Session

        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        session = Session(engine)
        self.addCleanup(session.close)
        base = declarative_base()
        # The production query functions below run unchanged over a minimal schema.
        def model(class_name, **attrs):
            return type(class_name, (base,), {"__tablename__": class_name.lower(), **attrs})

        dojos = model("Dojos", dojo_id=Column(Integer, primary_key=True), name=Column(String))
        admins = model(
            "DojoAdmins",
            dojo_id=Column(ForeignKey(dojos.dojo_id), primary_key=True),
            user_id=Column(Integer, primary_key=True),
        )
        modules = model(
            "DojoModules",
            dojo_id=Column(ForeignKey(dojos.dojo_id), primary_key=True),
            module_index=Column(Integer),
        )
        challenges = model(
            "DojoChallenges",
            challenge_id=Column(Integer, primary_key=True),
            dojo_id=Column(ForeignKey(modules.dojo_id)),
            module=relationship(modules),
            data={},
        )
        profiles = model(
            "LearningChallengeProfiles", challenge_id=Column(Integer, primary_key=True),
            author_id=Column(Integer),
        )
        users = model("Users", id=Column(Integer, primary_key=True), name=Column(String))
        models = (dojos, admins, modules, challenges, profiles, users)
        for mapped in models:
            mapped.query = session.query(mapped)
        base.metadata.create_all(engine)
        for course_id in range(1, 6):
            session.add(dojos(dojo_id=course_id, name=f"Math {course_id}"))
            session.add(admins(dojo_id=course_id, user_id=99 if course_id == 4 else 1))
            session.add(modules(dojo_id=course_id, module_index=0))
            session.add(challenges(challenge_id=course_id, dojo_id=course_id))
            session.add(profiles(challenge_id=course_id, author_id=course_id))
            session.add(users(id=course_id, name=f"Teacher {course_id}"))
        session.commit()

        statements = []
        def record_select(_connection, _cursor, statement, parameters, _context, _many):
            if statement.startswith("SELECT"):
                statements.append((statement, parameters))
        event.listen(engine, "before_cursor_execute", record_select)

        api = path.parents[1] / "api/v1/teaching.py"
        names = {
            "_teacher_dojos", "_course_question_list_inputs", "_course_question_people",
            "_course_question_published",
        }
        functions = [
            node for node in ast.parse(api.read_text()).body
            if isinstance(node, ast.FunctionDef) and node.name in names
        ]
        namespace = {mapped.__name__: mapped for mapped in models}
        namespace.update(
            defaultdict=defaultdict, joinedload=joinedload,
            get_config=lambda _key, _default: "5",
            is_runtime_reference=lambda draft: draft.legacy,
            is_supported_exercise=lambda _challenge: True,
        )
        exec(compile(ast.Module(functions, type_ignores=[]), str(api), "exec"), namespace)
        managed = namespace["_teacher_dojos"](SimpleNamespace(id=1, type="user"))
        self.assertEqual([course.dojo_id for course in managed], [1, 2, 3])

        drafts = {
            course_id: [SimpleNamespace(
                published_challenge_id=None, author_id=course_id, legacy=course_id != 1,
            )]
            for course_id in range(1, 6)
        }
        load = namespace["_course_question_list_inputs"]
        statements.clear()
        self.assertEqual(load(managed[:1], drafts), {})
        self.assertEqual(statements, [])
        self.assertEqual(set(load(managed[:2], drafts)), {2})
        single_course_queries = len(statements)
        self.assertGreater(single_course_queries, 0)

        statements.clear()
        inputs = load(managed, drafts)
        self.assertEqual(set(inputs), {2, 3})
        self.assertEqual(len(statements), single_course_queries)
        for statement, ids in statements:
            self.assertEqual(set(ids), {2, 3}, statement)
        for course_id, (_, rows, _, _, _) in inputs.items():
            self.assertEqual([row.dojo_id for row in rows], [course_id])


if __name__ == "__main__":
    unittest.main()
