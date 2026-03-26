interface SystemRulesSectionProps {
  readonly rollingPeriodDays: number;
  readonly pointsToTermination: number;
  readonly onRollingPeriodChange: (value: number) => void;
  readonly onPointsToTerminationChange: (value: number) => void;
}

export const SystemRulesSection = ({
  rollingPeriodDays,
  pointsToTermination,
  onRollingPeriodChange,
  onPointsToTerminationChange,
}: SystemRulesSectionProps) => {
  return (
    <div>
      <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary mb-4">
        System Rules
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="rollingPeriod"
            className="block text-xs md:text-sm 2xl:text-base font-medium text-secondary mb-1"
          >
            Rolling Period (days)
          </label>
          <input
            id="rollingPeriod"
            type="number"
            min={1}
            value={rollingPeriodDays}
            onChange={(e) =>
              onRollingPeriodChange(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
          />
          <p className="text-xs text-tertiary mt-1">
            Points older than this many days are no longer counted.
          </p>
        </div>
        <div>
          <label
            htmlFor="pointsToTermination"
            className="block text-xs md:text-sm 2xl:text-base font-medium text-secondary mb-1"
          >
            Points to Termination
          </label>
          <input
            id="pointsToTermination"
            type="number"
            min={1}
            value={pointsToTermination}
            onChange={(e) =>
              onPointsToTerminationChange(
                Math.max(1, parseInt(e.target.value) || 1),
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
          />
          <p className="text-xs text-tertiary mt-1">
            An employee reaching this point total triggers termination protocol.
          </p>
        </div>
      </div>
    </div>
  );
};
