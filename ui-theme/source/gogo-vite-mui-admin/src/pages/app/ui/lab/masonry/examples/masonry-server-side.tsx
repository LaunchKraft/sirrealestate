import Masonry from "@mui/lab/Masonry";
import { Card, CardContent } from "@mui/material";
const heights = ["h-37.5", "h-30", "h-90", "h-70", "h-52.5", "h-45", "h-45", "h-50", "h-40", "h-35"];

export default function MasonryServerSide() {
  return (
    <Masonry
      columns={{ xs: 1, sm: 2, lg: 3, xl: 4 }}
      spacing={5}
      defaultHeight={360}
      defaultColumns={4}
      defaultSpacing={5}
    >
      {heights.map((height, index) => (
        <Card key={index} className={height}>
          <CardContent>{index}</CardContent>
        </Card>
      ))}
    </Masonry>
  );
}
