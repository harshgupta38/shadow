import { Card, Placeholder } from "react-bootstrap";

interface SkeletonLoadingStateProps {
  for?: string;
}

export function SkeletonLoadingState({ for: forProp }: SkeletonLoadingStateProps) {
  const backgroundColor = "#89898c";

  const validList = ["metricCard"];
  if (forProp && !validList.includes(forProp)) {
    forProp = undefined;
  }

  return (
    <div>
      {forProp === "metricCard" && (
        <div className="d-flex justify-content-center align-items-center">
          <Card className="shadow-none border-0 w-100">
            {/* Title */}
            <Placeholder animation="wave">
              <Placeholder xs={4} style={{ height: "28px", borderRadius: "6px", width: "100%", backgroundColor: backgroundColor }} />
            </Placeholder>

            {/* Pills */}
            <Placeholder animation="wave" className="d-flex align-items-center gap-2 mt-2">
              <Placeholder xs={4} style={{ borderRadius: "20px", height: "22px", backgroundColor: backgroundColor }} />
              <Placeholder xs={2} style={{ borderRadius: "20px", height: "22px", backgroundColor: backgroundColor }} />
            </Placeholder>

            {/* Done & count*/}
            <Placeholder animation="wave" className="d-flex align-items-center justify-content-between mt-3 mb-2">
              <Placeholder xs={4} style={{ height: "34px", borderRadius: "6px", backgroundColor: backgroundColor }} />
              <Placeholder xs={1} style={{ height: "34px", borderRadius: "6px", backgroundColor: backgroundColor }} />
            </Placeholder>

            {/* Today & this week*/}
            <Placeholder animation="wave" className="d-flex justify-content-between mb-4">
              <Placeholder xs={2} style={{ backgroundColor: backgroundColor }} />
              <Placeholder xs={1} style={{ width: "30px", backgroundColor: backgroundColor }} />
            </Placeholder>

            {/* Heatmap */}
            <Placeholder animation="wave" className="d-flex justify-content-end align-items-end gap-2 mb-2">
              <Placeholder key={0} style={{ width: "38px", height: "30px", borderRadius: "6px", backgroundColor: backgroundColor }} />
              <Placeholder key={1} style={{ width: "38px", height: "38px", borderRadius: "6px", backgroundColor: backgroundColor }} />
              <Placeholder key={2} style={{ width: "38px", height: "34px", borderRadius: "6px", backgroundColor: backgroundColor }} />
              <Placeholder key={3} style={{ width: "38px", height: "28px", borderRadius: "6px", backgroundColor: backgroundColor }} />
              <Placeholder key={4} style={{ width: "38px", height: "38px", borderRadius: "6px", backgroundColor: backgroundColor }} />
            </Placeholder>

            {/* 7 days ago & today*/}
            <Placeholder animation="wave" className="d-flex justify-content-between">
              <Placeholder xs={2} style={{ backgroundColor: backgroundColor }} />
              <Placeholder xs={2} style={{ backgroundColor: backgroundColor }} />
            </Placeholder>
          </Card>
        </div>
      )}

      {forProp === undefined && (
        <div className="d-flex justify-content-center align-items-center">
          <Card className="shadow-none border-0 w-100">
            <Placeholder animation="wave">
              <Placeholder xs={4} style={{ height: "28px", borderRadius: "6px", width: "100%", backgroundColor: backgroundColor }} />
            </Placeholder>

            <Placeholder animation="wave" className="d-flex align-items-center gap-2 mt-2">
              <Placeholder xs={4} style={{ borderRadius: "20px", height: "22px", backgroundColor: backgroundColor }} />
              <Placeholder xs={2} style={{ borderRadius: "20px", height: "22px", backgroundColor: backgroundColor }} />
            </Placeholder>
          </Card>
        </div>
      )}
    </div>
  );
}
