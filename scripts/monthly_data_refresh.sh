#!/bin/bash -e

# Monthly Data Refresh Script
# Run this script on the 1st of every month to fetch new AL data and commit it

echo "=========================================="
echo "Starting Monthly Data Refresh"
echo "Date: $(date +'%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "Warning: You have uncommitted changes."
    read -p "Do you want to continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Step 1: Fetch data
echo "Step 1/4: Fetching AL data..."
echo "This may take around 1 hour..."
if ./scripts/run_fetch.sh; then
    echo "✓ Data fetched successfully"
else
    echo "✗ Fetch failed"
    exit 1
fi
echo ""

# Step 2: Run ETL
echo "Step 2/4: Running ETL pipeline..."
if ./scripts/run_etl.sh; then
    echo "✓ ETL completed successfully"
else
    echo "✗ ETL failed"
    exit 1
fi
echo ""

# Step 3: Add files to git
echo "Step 3/4: Adding files to git..."
git add downloads/al/*.csv.gz
git add downloads/postal_code/

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "No changes detected. Nothing to commit."
    exit 0
fi

echo "✓ Files staged for commit"
echo ""

# Show what will be committed
echo "Files to be committed:"
git diff --staged --name-only
echo ""

# Step 4: Commit and push
COMMIT_MSG="chore: monthly data refresh $(date +'%Y-%m-%d')"
echo "Step 4/4: Committing and pushing..."
echo "Commit message: $COMMIT_MSG"

read -p "Proceed with commit and push? (Y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "Aborted. Changes are staged but not committed."
    echo "You can commit manually with: git commit -m \"$COMMIT_MSG\""
    exit 1
fi

git commit -m "$COMMIT_MSG"

echo "Pushing to remote..."
if git push; then
    echo "✓ Changes pushed successfully"
else
    echo "✗ Push failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "Monthly Data Refresh Complete!"
echo "=========================================="
echo ""
echo "The GitHub Pages deployment will be triggered automatically."
echo "Check the Actions tab on GitHub to monitor the deployment."
