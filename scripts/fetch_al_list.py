from pathlib import Path
from datetime import datetime, timedelta
import duckdb
from calendar import monthrange
import time
import logging
import typer
from playwright.sync_api import sync_playwright
from tenacity import retry, stop_after_attempt, retry_if_exception_type, wait_random_exponential


# ---- Constants ----
URL = "https://rnt.turismodeportugal.pt/RNT/Pesquisa_AL.aspx"
DATE_INPUT_SELECTOR = "input[placeholder='AAAA-MM-DD']"
SEARCH_BUTTON_SELECTOR = "input[value='Pesquisar']"
EXPORT_LINK_TEXT = "Exportar detalhe registos"
DOWNLOAD_DIR = Path.cwd() / "downloads"
TEMP_FILENAME = "al_data.xlsx"
TABLE_NAME = "al_raw_data"
FIRST_DATE = "2008-01-01"

TIMEOUT_SECONDS = 5

# ---- Logging ----
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger(__name__)

def end_of_month(dt: datetime) -> datetime:
    last_day = monthrange(dt.year, dt.month)[1]
    return dt.replace(day=last_day)

END_OF_CURRENT_MONTH = end_of_month(datetime.now()).strftime("%Y-%m-%d")

# ---- CLI App ----
app = typer.Typer(pretty_exceptions_enable=False)

@retry(
    stop=stop_after_attempt(5),
    wait=wait_random_exponential(multiplier=1.2, min=2, max=10),
    retry=retry_if_exception_type(Exception),
    reraise=True
)
def run(conn, page, from_date: str, to_date: str, table_name):
    t1 = time.time()
    log.info(f"Fetching from {from_date} to {to_date} into table '{table_name}'")

    page.goto(URL)

    # Fill dates
    date_inputs = page.locator(DATE_INPUT_SELECTOR)
    if date_inputs.count() < 2:
        raise RuntimeError("Expected 2 date inputs, found less.")
    date_inputs.nth(0).fill(from_date)
    date_inputs.nth(1).fill(to_date)

    # Click and wait
    page.locator(SEARCH_BUTTON_SELECTOR).click()
    page.wait_for_timeout(TIMEOUT_SECONDS * 1000)

    # Download, return empty if couldn't find the export link within the timeout
    if not page.locator(f"a:has-text('{EXPORT_LINK_TEXT}')").is_visible(timeout=TIMEOUT_SECONDS * 1000):
        log.warning(f"No data to export")
        return
    with page.expect_download() as download_info:
        page.locator(f"a:has-text('{EXPORT_LINK_TEXT}')").click()
    download = download_info.value

    DOWNLOAD_DIR.mkdir(exist_ok=True)
    save_path = DOWNLOAD_DIR / TEMP_FILENAME
    download.save_as(save_path)

    # Load into DuckDB
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {table_name} AS 
        SELECT * FROM read_xlsx('{save_path}') -- , header=True, autodetect_types=True)
    """)
    conn.execute(f"""
        INSERT INTO {table_name}
        SELECT * FROM read_xlsx('{save_path}') -- , header=True, autodetect_types=True)
    """)
    num_rows = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]

    save_path.unlink()  # Clean temp file
    t2 = time.time()
    log.info(f"Fetched {num_rows} records for period {from_date} to {to_date} in {(t2 - t1):.2f} seconds.")
    # log.info(f"Loading data into DuckDB for dates {from_date} to {to_date} completed successfully.")

def move_to_raw_data(conn, ts, src_table, dest_table):
    log.info(f"Copying data from {src_table} to {dest_table}")
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {dest_table} AS 
        SELECT '{ts}'::timestamp as etl_ts, * FROM {src_table} where FALSE
    """)
    conn.execute(f"""
        INSERT INTO {dest_table}
        SELECT '{ts}'::timestamp as etl_ts, * FROM {src_table}
    """)
    conn.execute(f"DROP TABLE IF EXISTS {src_table}")

@app.command()
def run_per_month(
    from_dt: str = typer.Argument(FIRST_DATE, help="Start date in YYYY-MM-DD"),
    to_dt: str = typer.Argument(END_OF_CURRENT_MONTH, help="End date in YYYY-MM-DD"),
    db: Path = typer.Option(None, help="DuckDB file path", envvar="DB_LOCATION")
):
    if not db:
        raise typer.BadParameter("No database path provided and DB_LOCATION env var is not set.")

    start_date = datetime.strptime(from_dt, "%Y-%m-%d")
    end_date = datetime.strptime(to_dt, "%Y-%m-%d")
    if start_date > end_date:
        raise typer.BadParameter("Start date must be before or equal to end date.")
    # make end data always the end of the month
    end_date = end_of_month(end_date)
         
    now_table_name = "al_list_raw_" + datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
    conn = duckdb.connect(db)
    now = datetime.now()

    with sync_playwright() as p:
        browser = p.webkit.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        current = start_date
        while current <= end_date:
            next_month = (current.month % 12) + 1
            next_year = current.year + (current.month // 12)
            last_day = (datetime(next_year, next_month, 1) - timedelta(days=1)).day
            month_end = current.replace(day=last_day)
            if month_end > end_date:
                month_end = end_date

            run(conn, page, current.strftime("%Y-%m-%d"), month_end.strftime("%Y-%m-%d"), table_name=now_table_name)
            move_to_raw_data(conn, now, now_table_name, TABLE_NAME)
            current = month_end + timedelta(days=1)

        browser.close()
    conn.close()

if __name__ == "__main__":
    app()
