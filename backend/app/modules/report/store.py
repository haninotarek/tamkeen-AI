import json
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[4]
SHARED_MOCKS_DIR = PROJECT_ROOT / "shared" / "mocks"
DATA_DIR = Path(__file__).resolve().parents[3] / "data"
REPORTS_FILE = DATA_DIR / "reports_db.json"
RETAKES_FILE = DATA_DIR / "retakes_db.json"


def safe_load_shared_mock(name: str, default: Any = None) -> Any:
    """
    يحاول القراءة عبر app.core.mocks (إن كتبها عضو 1)،
    وإلا يقرأ مباشرة من shared/mocks/{name}.json بأمان حتى لو الملف 0 بايت.
    """
    try:
        import app.core.mocks as core_mocks  # type: ignore

        for fn_name in ("load_mock", "get_mock", "read_mock"):
            fn = getattr(core_mocks, fn_name, None)
            if callable(fn):
                res = fn(name)
                if res:
                    return res
    except Exception:
        pass

    filename = name if name.endswith(".json") else f"{name}.json"
    mock_path = SHARED_MOCKS_DIR / filename
    if not mock_path.exists():
        return default if default is not None else {}
    try:
        raw = mock_path.read_text(encoding="utf-8").strip()
        if not raw:
            return default if default is not None else {}
        return json.loads(raw)
    except Exception:
        return default if default is not None else {}


def _ensure_data_dir() -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


def _load_seed_reports() -> List[Dict[str, Any]]:
    mock_data = safe_load_shared_mock("report", default={})
    if isinstance(mock_data, dict) and isinstance(mock_data.get("reports"), list):
        return mock_data["reports"]
    if isinstance(mock_data, list):
        return mock_data
    return []


def get_all_reports() -> List[Dict[str, Any]]:
    if REPORTS_FILE.exists():
        try:
            raw = REPORTS_FILE.read_text(encoding="utf-8").strip()
            if raw:
                items = json.loads(raw)
                if isinstance(items, list) and len(items) > 0:
                    return items
        except Exception:
            pass
    seeds = _load_seed_reports()
    if seeds:
        _save_reports(seeds)
    return seeds


def _save_reports(reports: List[Dict[str, Any]]) -> None:
    _ensure_data_dir()
    try:
        REPORTS_FILE.write_text(
            json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        pass


def get_report_by_id(report_id: str) -> Optional[Dict[str, Any]]:
    for r in get_all_reports():
        if r.get("id") == report_id:
            return r
    return None


def save_report(report: Dict[str, Any]) -> Dict[str, Any]:
    reports = get_all_reports()
    idx = next((i for i, r in enumerate(reports) if r.get("id") == report.get("id")), -1)
    if idx >= 0:
        reports[idx] = report
    else:
        reports.insert(0, report)
    _save_reports(reports)
    return report


def delete_report(report_id: str) -> bool:
    reports = get_all_reports()
    filtered = [r for r in reports if r.get("id") != report_id]
    if len(filtered) == len(reports):
        return False
    _save_reports(filtered)
    return True


def list_retake_sessions() -> List[Dict[str, Any]]:
    if RETAKES_FILE.exists():
        try:
            raw = RETAKES_FILE.read_text(encoding="utf-8").strip()
            if raw:
                data = json.loads(raw)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    mock_data = safe_load_shared_mock("report", default={})
    if isinstance(mock_data, dict) and isinstance(mock_data.get("retakeSessions"), list):
        return mock_data["retakeSessions"]
    return []


def get_retake_session_by_id(session_id: str) -> Optional[Dict[str, Any]]:
    for s in list_retake_sessions():
        if s.get("id") == session_id:
            return s
    return None


def save_retake_session(session: Dict[str, Any]) -> Dict[str, Any]:
    sessions = list_retake_sessions()
    idx = next((i for i, s in enumerate(sessions) if s.get("id") == session.get("id")), -1)
    if idx >= 0:
        sessions[idx] = session
    else:
        sessions.insert(0, session)
    _ensure_data_dir()
    try:
        RETAKES_FILE.write_text(
            json.dumps(sessions, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        pass
    return session


# أسماء بديلة للتوافق مع أي استدعاء خارجي من باقي التيم
list_reports = get_all_reports
get_report = get_report_by_id
upsert_report = save_report
get_retake = get_retake_session_by_id
save_retake = save_retake_session
