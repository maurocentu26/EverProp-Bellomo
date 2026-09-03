import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { size } from "node_modules/@base-ui/react/floating-ui-react";

type IconProps = React.ComponentPropsWithoutRef<"svg"> & {
  size?: number;
  strokeWidth?: number;
};

type Props = {
  title: string;
  value: string | number;
  delta?: string;
  Icon?: React.ComponentType<IconProps>;
};

export default function MetricCard({ title, value, delta, Icon }: Props) {
  const deltaIsNegative = typeof delta === "string" && delta.trim().startsWith("-");

  return (
    <Card className="bg-white text-slate-900">
      <CardHeader className="flex justify-between">
        <CardTitle>{title}</CardTitle>
        {Icon && <Icon size={20}/>}
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {delta && (
          <Badge variant={deltaIsNegative ? "negative" : "positive"}>{delta}</Badge>
        )}
      </CardContent>
    </Card>
  );
}
