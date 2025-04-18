import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
from datetime import datetime

# Data for experiments - Round 2 (DEF)
dates = [
    "2025-04-10",
    "2025-04-11",
    "2025-04-12",
    "2025-04-13",
    "2025-04-14",
    "2025-04-15",
    "2025-04-16",
]

# TVL-adjusted markouts data (in percentage)
markouts_D = [
    -0.395828,
    -0.006553,
    -0.268828,
    0.012593,
    0.096305,
    0.021320,
    0.165347,
]

markouts_E = [
    -0.827407,
    -0.050365,
    -0.316740,
    0.002627,
    0.047716,
    -0.001307,
    0.112707,
]

markouts_F = [
    -0.038595,
    -0.047383,
    -0.230420,
    0.148672,
    0.164657,
    0.023312,
    0.173359,
]

uniswap_markouts = [
    -0.435705,
    0.079784,
    -0.152536,
    0.095929,
    0.210961,
    -0.006330,
    0.172998,
]

# Convert dates to datetime objects
dates = [datetime.strptime(date, "%Y-%m-%d") for date in dates]

# Calculate running totals
running_total_D = np.cumsum(markouts_D)
running_total_E = np.cumsum(markouts_E)
running_total_F = np.cumsum(markouts_F)
running_total_uniswap = np.cumsum(uniswap_markouts)

# Create the figure with professional styling
plt.figure(figsize=(12, 8))
plt.style.use("ggplot")

# Custom colors for better brand identity
colors = {
    "D": "#3366CC",  # Blue
    "E": "#FF9933",  # Orange
    "F": "#33CC99",  # Teal
    "Uniswap": "#ff37c7",  # Pink
}

# Plot running totals with custom styling
plt.plot(
    dates,
    running_total_D,
    label="Experiment D",
    linewidth=2.5,
    marker="o",
    markersize=6,
    color=colors["D"],
)
plt.plot(
    dates,
    running_total_E,
    label="Experiment E",
    linewidth=2.5,
    marker="s",
    markersize=6,
    color=colors["E"],
)
plt.plot(
    dates,
    running_total_F,
    label="Experiment F",
    linewidth=2.5,
    marker="^",
    markersize=6,
    color=colors["F"],
)
plt.plot(
    dates,
    running_total_uniswap,
    label="Uniswap v3",
    linewidth=2.5,
    linestyle="--",
    color=colors["Uniswap"],
)

# Format x-axis to show dates nicely
plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
plt.gca().xaxis.set_major_locator(mdates.DayLocator(interval=1))
plt.xticks(rotation=45)

# Format y-axis to show percentages
plt.gca().yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x:.1f}%"))

# Add zero line for reference
plt.axhline(y=0, color="gray", linestyle="-", alpha=0.5)

# Add labels and title with professional styling
plt.xlabel("Date (April 2025)", fontsize=14, fontweight="bold")
plt.ylabel("Cumulative TVL-Adjusted Markout (%)", fontsize=14, fontweight="bold")
plt.title(
    "Bunni Experiments: Round 2",
    fontsize=18,
    fontweight="bold",
)

# Experiment descriptions
descriptions = {
    "D": "Higher max fee (10%)",
    "E": "Longer dynamic fee window",
    "F": "Higher max fee + 4x faster fee increase",
}

# Create custom legend with descriptions
legend_labels = [
    f'Experiment D: {descriptions["D"]}',
    f'Experiment E: {descriptions["E"]}',
    f'Experiment F: {descriptions["F"]}',
    "Uniswap v3 (0.05% fee pool on Base)",
]

plt.legend(legend_labels, loc="lower left", fontsize=11, fancybox=True, framealpha=0.9)

# Add annotations for final values
for i, (label, data, color) in enumerate(
    [
        ("D", running_total_D, colors["D"]),
        ("E", running_total_E, colors["E"]),
        ("F", running_total_F, colors["F"]),
        ("Uniswap", running_total_uniswap, colors["Uniswap"]),
    ]
):
    plt.annotate(
        f"{data[-1]:.2f}%",
        xy=(dates[-1], data[-1]),
        xytext=(10, 0),
        textcoords="offset points",
        fontsize=11,
        fontweight="bold",
        color=color,
    )

# Highlight breakthrough for Experiment F
plt.annotate(
    "Breakthrough! Experiment F\noutperforms Uniswap v3",
    xy=(dates[-1], running_total_F[-1]),
    xytext=(-100, 30),
    textcoords="offset points",
    fontsize=11,
    fontweight="bold",
    arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=-.2", color="black"),
)

# Add grid for better readability
plt.grid(True, linestyle="--", alpha=0.7)

# Add Bunni branding
plt.figtext(
    0.95, 0.03, "bunni.xyz", fontsize=14, fontweight="bold", color="#666666", ha="right"
)

# Tight layout and save with high resolution
plt.tight_layout()
plt.savefig("bunni_experiments_round2.png", dpi=300, bbox_inches="tight")
plt.show()