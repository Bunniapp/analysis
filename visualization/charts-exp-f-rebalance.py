import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np
from datetime import datetime

# Data for Experiment F with different rebalance markouts
dates = [
    "2025-04-10",
    "2025-04-11",
    "2025-04-12",
    "2025-04-13",
    "2025-04-14",
    "2025-04-15",
    "2025-04-16",
    "2025-04-17",
]

# Original Experiment F without rebalance markouts
markouts_F_original = [
    -0.038595,
    -0.047383,
    -0.230420,
    0.148672,
    0.164657,
    0.023312,
    0.173359,
    0.000000,  # No data provided for 04-17 in original experiment
]

# F with regular rebalance markouts
markouts_F_regular = [
    -0.236629,
    -0.047383,
    -0.230420,
    -0.258969,
    0.012951,
    -0.261981,
    0.116434,
    0.114779,
]

# F with adjusted rebalance markouts (1% slippage adjustment)
markouts_F_adjusted = [
    -0.195695,
    -0.047383,
    -0.230420,
    -0.097668,
    0.169789,
    -0.190800,
    0.187124,
    0.114779,
]

# Uniswap V3 markouts for comparison
uniswap_markouts = [
    -0.435705,
    0.079784,
    -0.152536,
    0.095929,
    0.210961,
    -0.006330,
    0.172998,
    0.130329,
]

# Convert dates to datetime objects
dates = [datetime.strptime(date, "%Y-%m-%d") for date in dates]

# Calculate running totals
running_total_F_original = np.cumsum(markouts_F_original)
running_total_F_regular = np.cumsum(markouts_F_regular)
running_total_F_adjusted = np.cumsum(markouts_F_adjusted)
running_total_uniswap = np.cumsum(uniswap_markouts)

# Create the figure with professional styling
plt.figure(figsize=(12, 8))
plt.style.use("ggplot")

# Custom colors for better brand identity
colors = {
    "F_Original": "#00AA55",  # Green - for original F
    "F_Regular": "#33CC99",   # Teal - for F with rebalance
    "F_Adjusted": "#5D4DB3",  # Purple - for F with adjusted rebalance
    "Uniswap": "#ff37c7",     # Pink - for Uniswap
}

# Plot running totals with custom styling
plt.plot(
    dates[:-1],  # Exclude the last date where we have no data
    running_total_F_original[:-1],
    label="Experiment F (no rebalance)",
    linewidth=2.5,
    marker="*",
    markersize=8,
    color=colors["F_Original"],
)
plt.plot(
    dates,
    running_total_F_regular,
    label="Experiment F (with rebalance)",
    linewidth=2.5,
    marker="^",
    markersize=6,
    color=colors["F_Regular"],
)
plt.plot(
    dates,
    running_total_F_adjusted,
    label="Experiment F (slippage adjusted)",
    linewidth=2.5,
    marker="o",
    markersize=6,
    color=colors["F_Adjusted"],
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
    "Experiment F Performance: Impact of Rebalance Costs",
    fontsize=18,
    fontweight="bold",
)

# Experiment descriptions
descriptions = {
    "F_Original": "Without rebalance costs",
    "F_Regular": "With rebalance costs",
    "F_Adjusted": "With 1% slippage adjustment",
}

# Create custom legend with descriptions
legend_labels = [
    f'Experiment F: {descriptions["F_Original"]}',
    f'Experiment F: {descriptions["F_Regular"]}',
    f'Experiment F: {descriptions["F_Adjusted"]}',
    "Uniswap v3 (0.05% fee pool on Base)",
]

plt.legend(legend_labels, loc="lower left", fontsize=11, fancybox=True, framealpha=0.9)

# Add annotations for final values (excluding the original F's last value which is a placeholder)
for i, (label, data, color) in enumerate(
    [
        ("F_Original", running_total_F_original[:-1], colors["F_Original"]),
        ("F_Regular", running_total_F_regular, colors["F_Regular"]),
        ("F_Adjusted", running_total_F_adjusted, colors["F_Adjusted"]),
        ("Uniswap", running_total_uniswap, colors["Uniswap"]),
    ]
):
    plt.annotate(
        f"{data[-1]:.2f}%",
        xy=(dates[len(data)-1], data[-1]),
        xytext=(10, 0),
        textcoords="offset points",
        fontsize=11,
        fontweight="bold",
        color=color,
    )

# Add annotation highlighting the positive performance without rebalance costs
plt.annotate(
    "Without rebalance costs,\nExp F showed positive returns",
    xy=(dates[5], running_total_F_original[5]),
    xytext=(-130, 40),
    textcoords="offset points",
    fontsize=11,
    fontweight="bold",
    arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=-.2", color="black"),
)

# Add annotation about rebalance impact
plt.annotate(
    "Rebalance costs significantly\nimpact performance",
    xy=(dates[5], running_total_F_regular[5]),
    xytext=(-120, -60),
    textcoords="offset points",
    fontsize=11,
    fontweight="bold",
    arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=.2", color="black"),
)

# Add annotation about slippage adjustment
plt.annotate(
    "Slippage adjustment improves\nperformance but challenges remain",
    xy=(dates[6], running_total_F_adjusted[6]),
    xytext=(30, 60),
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
plt.savefig("bunni_experiment_f_complete_comparison.png", dpi=300, bbox_inches="tight")
plt.show()