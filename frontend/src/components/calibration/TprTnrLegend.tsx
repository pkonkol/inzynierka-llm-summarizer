/** Plain-language legend for TPR and TNR with a worked example, for every page that shows judge agreement. */
export function TprTnrLegend() {
  return (
    <div className="grid gap-2 text-caption">
      <dl className="grid gap-2">
        <div>
          <dt className="font-medium">TPR (true positive rate, czułość)</dt>
          <dd>
            Spośród zdań, keyfactów i streszczeń oznaczonych przez Ciebie jako dobre: odsetek, który
            sędzia też uznał za dobre. Przykład: 10 zdań wiernych, sędzia potwierdził 9 → TPR 90 %.
          </dd>
        </div>
        <div>
          <dt className="font-medium">TNR (true negative rate, swoistość)</dt>
          <dd>
            Spośród oznaczonych przez Ciebie jako złe: odsetek, który sędzia wyłapał. Przykład: 5
            zdań niewiernych, sędzia wyłapał 4 → TNR 80 %.
          </dd>
        </div>
      </dl>
      <p className="text-mute">
        Odpowiedzi „niejasne” nie wchodzą do żadnej z liczb. Próg wyboru sędziego: oba ≥ 90 %.
      </p>
    </div>
  );
}
