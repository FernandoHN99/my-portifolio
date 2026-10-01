Attribute VB_Name = "modTables"
'==============================================================================
' modTables - Helpers para tabelas nativas do Excel (ListObject)
'==============================================================================
' Ler, localizar e inserir linhas em tabelas nativas.

Option Explicit

' *** Obter ListObject por nome (sheet + tabela) ***
Public Function GetListObject(sheetName As String, tableName As String) As ListObject
    On Error Resume Next
    Set GetListObject = ThisWorkbook.Worksheets(sheetName).ListObjects(tableName)
    On Error GoTo 0
End Function

' *** Maior data da coluna informada (ignora erros de valores) ***
Public Function GetLastDateOfData(tbl As ListObject, colName As String) As Date
    Dim rng As Range

    On Error GoTo Fail
    Set rng = tbl.ListColumns(colName).DataBodyRange
    If rng Is Nothing Then
        GetLastDateOfData = 0
        Exit Function
    End If

    GetLastDateOfData = Application.WorksheetFunction.Max(rng)
    Exit Function

Fail:
    GetLastDateOfData = 0
End Function

' *** Ler as linhas da ultima leva (todas com lastDate), em ordem NATURAL ***
' Retorna Collection de KeyValueStore; cada item tem as colunas por nome.
' Ordem natural = de cima para baixo (mesma ordem visual da tabela).
Public Function GetLastRows(tbl As ListObject, colDateName As String, lastDate As Date) As Collection
    Dim result As Collection
    Dim rng As Range
    Dim row As Long
    Dim firstRow As Long
    Dim cellValue As Variant
    Dim rowDict As KeyValueStore
    Dim col As ListColumn
    Dim dateIdx As Long

    Set result = New Collection

    On Error GoTo Fail

    Set rng = tbl.DataBodyRange
    If rng Is Nothing Then
        Set GetLastRows = result
        Exit Function
    End If

    dateIdx = tbl.ListColumns(colDateName).Index

    ' 1) Achar a primeira linha (de baixo p/ cima) que ainda pertence a lastDate
    firstRow = rng.rows.Count + 1
    For row = rng.rows.Count To 1 Step -1
        cellValue = rng.Cells(row, dateIdx).Value
        If Not IsDate(cellValue) Then Exit For
        If CLng(CDate(cellValue)) <> CLng(lastDate) Then Exit For
        firstRow = row
    Next row

    If firstRow > rng.rows.Count Then
        Set GetLastRows = result
        Exit Function
    End If

    ' 2) Coletar de firstRow ate o fim, em ordem natural
    For row = firstRow To rng.rows.Count
        Set rowDict = New KeyValueStore
        For Each col In tbl.ListColumns
            rowDict.Item(col.Name) = rng.Cells(row, col.Index).Value
        Next col
        result.Add rowDict
    Next row

    Set GetLastRows = result
    Exit Function

Fail:
    Set GetLastRows = result
End Function

' *** Duplicar a ultima leva trocando apenas a coluna Data (investimentos) ***
Public Sub DuplicateLastRowsToNewDate(tbl As ListObject, colDateName As String, oldLastDate As Date, newDate As Date)
    Dim lastRows As Collection
    Dim rowDict As KeyValueStore
    Dim newRow As ListRow
    Dim col As ListColumn
    Dim i As Long

    On Error GoTo Fail

    Set lastRows = GetLastRows(tbl, colDateName, oldLastDate)

    For i = 1 To lastRows.Count
        Set rowDict = lastRows(i)
        Set newRow = tbl.ListRows.Add()

        For Each col In tbl.ListColumns
            If col.Name = colDateName Then
                newRow.Range.Cells(1, col.Index).Value = newDate
            Else
                ' So escreve valores; colunas de formula da tabela se
                ' auto-preenchem ao adicionar a linha (nao sobrescrever).
                If Not IsFormulaColumn(tbl, col.Index) Then
                    newRow.Range.Cells(1, col.Index).Value = rowDict.Item(col.Name)
                End If
            End If
        Next col
    Next i

    Exit Sub

Fail:
    Err.Raise Err.Number, "DuplicateLastRowsToNewDate", Err.Description
End Sub

' *** Detecta se a coluna da tabela contem formula (na 1a linha de dados) ***
Private Function IsFormulaColumn(tbl As ListObject, colIndex As Long) As Boolean
    On Error GoTo Fail
    If tbl.DataBodyRange Is Nothing Then
        IsFormulaColumn = False
        Exit Function
    End If
    IsFormulaColumn = tbl.DataBodyRange.Cells(1, colIndex).HasFormula
    Exit Function
Fail:
    IsFormulaColumn = False
End Function
