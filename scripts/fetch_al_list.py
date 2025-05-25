from pathlib import Path
from playwright.sync_api import sync_playwright

def run(from_date, to_date):
    download_dir = Path.cwd() / "downloads"
    download_dir.mkdir(exist_ok=True)
    print(f"From: {from_date}, To: {to_date}")

    with sync_playwright() as p:
        browser = p.webkit.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        print("Opening page...")
        page.goto("https://rnt.turismodeportugal.pt/RNT/Pesquisa_AL.aspx")

        # Fill in the two date inputs
        date_inputs = page.locator("input[placeholder='AAAA-MM-DD']")
        if date_inputs.count() < 2:
            raise RuntimeError("Expected 2 date inputs, found less.")
        print(f"Found {date_inputs.count()} date inputs.")
        date_inputs.nth(0).fill(from_date) # "2021-01-01")
        date_inputs.nth(1).fill(to_date) # "2021-02-01")

        # Click the search button
        print("Clicking search button...")
        page.locator("input[value='Pesquisar']").click()
        print("Waiting for results...")
        page.wait_for_timeout(2000)  # crude wait
        print("Results loaded.")

        # Wait for download
        with page.expect_download() as download_info:
            page.locator("a:has-text('Exportar detalhe registos')").click()

        download = download_info.value
        save_path = download_dir / "al_data.xlsx"
        download.save_as(save_path)

        print(f"Downloaded to {save_path}")
        # rename the file to include the date range
        new_name = f"al_data_{from_date.replace('-', '')}_{to_date.replace('-', '')}.xlsx"
        new_path = download_dir / new_name
        save_path.rename(new_path)
        browser.close()

def run_per_month(from_date, to_date):
    from datetime import datetime, timedelta

    start_date = datetime.strptime(from_date, "%Y-%m-%d")
    end_date = datetime.strptime(to_date, "%Y-%m-%d")
    

    current_date = start_date
    while current_date <= end_date:
        next_month = (current_date.month % 12) + 1
        next_year = current_date.year + (current_date.month // 12)
        last_day_of_month = (datetime(next_year, next_month, 1) - timedelta(days=1)).day
        month_end_date = current_date.replace(day=last_day_of_month)

        run(current_date.strftime("%Y-%m-%d"), month_end_date.strftime("%Y-%m-%d"))

        current_date = month_end_date + timedelta(days=1)

run_per_month("2023-03-01", "2025-06-01")
