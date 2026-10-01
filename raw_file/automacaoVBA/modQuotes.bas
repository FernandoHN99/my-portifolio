Attribute VB_Name = "modQuotes"
'==============================================================================
' modQuotes - Atualizacao de cotacoes (VBA puro, sem Python)
'==============================================================================
' Replica o roteamento do main.py:
'   Tipo = FIAT   -> AwesomeAPI (BRL fica 1.0 implicito)
'   Tipo = CRIPTO -> CoinGecko
'   Demais ativos: Moeda Base = USD -> Finnhub
'                  senao            -> Alpha Vantage
'   Todo ativo nao-FIAT/nao-CRIPTO e convertido para BRL pela Moeda Base.
'
' Fluxo:
'   - Le ultima leva de Table_Cotacoes (linhas com a maior Data).
'   - Se virou o mes: adiciona nova leva (Data = 1o dia do mes atual) e busca.
'   - Se mesmo mes: atualiza os valores da ultima leva no lugar.

Option Explicit

' *** MAIN: atualizar cotacoes ***
Public Sub UpdateQuotes()
    Dim tbl As ListObject
    Dim lastDate As Date
    Dim firstDayMonth As Date
    Dim isInsert As Boolean
    Dim rows As Collection
    Dim currencyMap As KeyValueStore

    On Error GoTo ErrorHandler

    Set tbl = GetListObject(SHEET_COTACOES, TABLE_COTACOES)
    If tbl Is Nothing Then
        Err.Raise vbObjectError + 1, , "Tabela " & TABLE_COTACOES & " nao encontrada."
    End If

    lastDate = GetLastDateOfData(tbl, COL_COTACOES_DATA)
    firstDayMonth = GetFirstDayOfMonth(Date)
    isInsert = (lastDate < firstDayMonth)

    ' Ler ultima leva de cotacoes como Collection de Dictionaries
    Set rows = GetLastRows(tbl, COL_COTACOES_DATA, lastDate)
    If rows.Count = 0 Then Exit Sub

    ' 1a passada: buscar moedas FIAT (precisamos delas p/ converter ativos)
    Set currencyMap = FetchAllValues(rows)

    ' Converter todos os ativos nao-FIAT/nao-CRIPTO para BRL usando currencyMap
    ApplyCurrencyConversion rows, currencyMap

    ' Gravar de volta na planilha
    If isInsert Then
        InsertQuoteRows tbl, rows, firstDayMonth
    Else
        UpdateQuoteRows tbl, rows
    End If

    Exit Sub

ErrorHandler:
    Err.Raise Err.Number, "UpdateQuotes", Err.Description
End Sub

' *** Buscar valor de cada linha; retorna map Ticker->Valor das moedas FIAT ***
Private Function FetchAllValues(rows As Collection) As KeyValueStore
    Dim currencyMap As KeyValueStore
    Dim i As Long
    Dim rowDict As KeyValueStore
    Dim ticker As String
    Dim assetType As String
    Dim currencyBase As String
    Dim val As Variant

    Set currencyMap = New KeyValueStore
    currencyMap.Item("BRL") = 1

    For i = 1 To rows.Count
        Set rowDict = rows(i)
        ticker = CStr(rowDict.Item(COL_COTACOES_TICKER))
        assetType = CStr(rowDict.Item(COL_COTACOES_TIPO))
        currencyBase = CStr(rowDict.Item(COL_COTACOES_MOEDA_BASE))

        Select Case UCase(assetType)
            Case UCase(TYPE_FIAT)
                val = FetchCurrency(ticker)
                If IsNumeric(val) Then currencyMap.Item(UCase(ticker)) = val

            Case UCase(TYPE_CRIPTO)
                val = FetchCrypto(ticker)

            Case Else
                If UCase(currencyBase) = "USD" Then
                    val = FetchAssetFinnhub(ticker)
                Else
                    ' Alpha Vantage: valor na moeda base; conversao depois
                    val = FetchAssetAlphaVantage(ticker)
                End If
        End Select

        rowDict.Item("__val") = val
    Next i

    Set FetchAllValues = currencyMap
End Function

' *** Converter ativos (nao-FIAT, nao-CRIPTO) para BRL ***
Private Sub ApplyCurrencyConversion(rows As Collection, currencyMap As KeyValueStore)
    Dim i As Long
    Dim rowDict As KeyValueStore
    Dim assetType As String
    Dim currencyBase As String
    Dim val As Variant
    Dim rate As Variant

    For i = 1 To rows.Count
        Set rowDict = rows(i)
        assetType = UCase(CStr(rowDict.Item(COL_COTACOES_TIPO)))
        currencyBase = CStr(rowDict.Item(COL_COTACOES_MOEDA_BASE))
        val = rowDict.Item("__val")

        currencyBase = UCase(currencyBase)

        If assetType <> UCase(TYPE_FIAT) And assetType <> UCase(TYPE_CRIPTO) Then
            If IsNumeric(val) Then
                If currencyMap.Exists(currencyBase) Then
                    rate = currencyMap.Item(currencyBase)
                    If IsNumeric(rate) Then rowDict.Item("__val") = CDbl(val) * CDbl(rate)
                End If
            End If
        End If
    Next i
End Sub

'==============================================================================
' APIs
'==============================================================================

' *** AwesomeAPI: moeda FIAT -> BRL. BRL = 1.0 implicito ***
Private Function FetchCurrency(ticker As String) As Variant
    Dim url As String
    Dim resp As String
    Dim val As Variant

    If UCase(ticker) = "BRL" Then
        FetchCurrency = 1
        Exit Function
    End If

    url = API_URL_AWESOME_API & ticker & "-BRL"
    resp = HttpGet(url)
    If Len(resp) = 0 Then
        FetchCurrency = "Error"
        Exit Function
    End If

    ' Resposta: {"USDBRL":{"bid":"5.23",...}} -> pegar "bid"
    val = JsonGetNumberByKey(resp, "bid")
    FetchCurrency = IIf(IsNull(val), "Error", val)
End Function

' *** Finnhub: acao/ETF em USD -> campo "c" (current price) ***
Private Function FetchAssetFinnhub(ticker As String) As Variant
    Dim url As String
    Dim resp As String
    Dim val As Variant

    url = API_URL_FINNHUB & "?symbol=" & ticker & "&token=" & API_KEY_FINNHUB
    resp = HttpGet(url)
    If Len(resp) = 0 Then
        FetchAssetFinnhub = "Error"
        Exit Function
    End If

    val = JsonGetNumberByKey(resp, "c")
    FetchAssetFinnhub = IIf(IsNull(val), "Error", val)
End Function

' *** Alpha Vantage: TIME_SERIES_DAILY -> primeiro "4. close" ***
Private Function FetchAssetAlphaVantage(ticker As String) As Variant
    Dim url As String
    Dim resp As String
    Dim val As Variant

    url = API_URL_ALPHA_VANTAGE & "?function=TIME_SERIES_DAILY&symbol=" & ticker & "&apikey=" & API_KEY_ALPHA
    resp = HttpGet(url)
    If Len(resp) = 0 Then
        FetchAssetAlphaVantage = "Error"
        Exit Function
    End If

    ' O primeiro "4. close" no JSON e o mais recente (Alpha Vantage ordena desc)
    val = JsonGetNumberByKey(resp, "4. close")
    FetchAssetAlphaVantage = IIf(IsNull(val), "Error", val)

    ' Alpha Vantage free ~5 req/min: pausa curta entre chamadas
    WaitSeconds DELAY_ALPHA_VANTAGE
End Function

' *** CoinGecko: preco em BRL ***
Private Function FetchCrypto(ticker As String) As Variant
    Dim url As String
    Dim resp As String
    Dim val As Variant
    Dim coinId As String

    coinId = ResolveCoinGeckoId(ticker)
    If Len(coinId) = 0 Then
        FetchCrypto = "Error"
        Exit Function
    End If

    url = API_URL_COINGECKO & "?ids=" & coinId & "&vs_currencies=brl&x_cg_demo_api_key=" & API_KEY_GECKO
    resp = HttpGet(url)
    If Len(resp) = 0 Then
        FetchCrypto = "Error"
        Exit Function
    End If

    val = JsonGetNumberByKey(resp, "brl")
    FetchCrypto = IIf(IsNull(val), "Error", val)
End Function

' *** Resolver ticker simbolo para o id do CoinGecko ***
Private Function ResolveCoinGeckoId(ticker As String) As String
    Dim normalized As String
    Dim id As String

    normalized = LCase(Trim(ticker))

    Select Case normalized
        Case "btc": id = "bitcoin"
        Case "sol": id = "solana"
        Case "eth": id = "ethereum"
        Case "ada": id = "cardano"
        Case "xrp": id = "ripple"
        Case "bnb": id = "binancecoin"
        Case "doge": id = "dogecoin"
        Case "dot": id = "polkadot"
        Case "matic": id = "polygon"
        Case "ltc": id = "litecoin"
        Case Else
            ' Se o valor ja for um id conhecido (ex: bitcoin, solana), usa direto.
            If Len(normalized) > 4 Then
                id = normalized
            Else
                id = ResolveCoinGeckoIdBySearch(normalized)
            End If
    End Select

    ResolveCoinGeckoId = id
End Function

' *** Fallback: procura o id no endpoint /search do CoinGecko ***
Private Function ResolveCoinGeckoIdBySearch(symbol As String) As String
    Dim url As String
    Dim resp As String
    Dim symbolPattern As String
    Dim matchPos As Long
    Dim idPos As Long
    Dim idStart As Long
    Dim idEnd As Long

    If Len(symbol) = 0 Then Exit Function

    url = "https://api.coingecko.com/api/v3/search?query=" & symbol & "&x_cg_demo_api_key=" & API_KEY_GECKO
    resp = HttpGet(url)
    If Len(resp) = 0 Then Exit Function

    symbolPattern = Chr$(34) & "symbol" & Chr$(34) & ":" & Chr$(34) & symbol & Chr$(34)
    matchPos = InStr(1, resp, symbolPattern, vbTextCompare)
    If matchPos = 0 Then Exit Function

    idPos = InStrRev(Left$(resp, matchPos), Chr$(34) & "id" & Chr$(34) & ":" & Chr$(34))
    If idPos = 0 Then Exit Function

    idStart = idPos + Len(Chr$(34) & "id" & Chr$(34) & ":" & Chr$(34))
    idEnd = InStr(idStart, resp, Chr$(34))
    If idEnd = 0 Then Exit Function

    ResolveCoinGeckoIdBySearch = Mid$(resp, idStart, idEnd - idStart)
End Function

'==============================================================================
' Escrita na planilha
'==============================================================================

' *** Inserir nova leva de cotacoes (virou o mes) ***
Private Sub InsertQuoteRows(tbl As ListObject, rows As Collection, newDate As Date)
    Dim i As Long
    Dim rowDict As KeyValueStore
    Dim newRow As ListRow

    ' rows() esta em ordem natural (cima->baixo); insere na mesma ordem
    For i = 1 To rows.Count
        Set rowDict = rows(i)
        Set newRow = tbl.ListRows.Add()

        newRow.Range.Cells(1, tbl.ListColumns(COL_COTACOES_DATA).Index).Value = newDate
        newRow.Range.Cells(1, tbl.ListColumns(COL_COTACOES_TICKER).Index).Value = rowDict.Item(COL_COTACOES_TICKER)
        newRow.Range.Cells(1, tbl.ListColumns(COL_COTACOES_VALOR).Index).Value = rowDict.Item("__val")
        newRow.Range.Cells(1, tbl.ListColumns(COL_COTACOES_MOEDA_BASE).Index).Value = rowDict.Item(COL_COTACOES_MOEDA_BASE)
        newRow.Range.Cells(1, tbl.ListColumns(COL_COTACOES_TIPO).Index).Value = rowDict.Item(COL_COTACOES_TIPO)
    Next i
End Sub

' *** Atualizar valores da ultima leva no lugar (mesmo mes) ***
Private Sub UpdateQuoteRows(tbl As ListObject, rows As Collection)
    Dim i As Long
    Dim rowDict As KeyValueStore
    Dim totalRows As Long
    Dim firstRow As Long
    Dim valIdx As Long

    totalRows = tbl.DataBodyRange.rows.Count
    valIdx = tbl.ListColumns(COL_COTACOES_VALOR).Index

    ' rows() em ordem natural: as ultimas N linhas da tabela correspondem
    ' diretamente a rows(1..N).
    firstRow = totalRows - rows.Count + 1
    For i = 1 To rows.Count
        Set rowDict = rows(i)
        tbl.DataBodyRange.Cells(firstRow + i - 1, valIdx).Value = rowDict.Item("__val")
    Next i
End Sub

' *** HELPER: pausa em segundos sem travar o Excel ***
Private Sub WaitSeconds(secs As Double)
    Dim t As Double
    t = Timer
    Do While Timer - t < secs
        DoEvents
    Loop
End Sub
