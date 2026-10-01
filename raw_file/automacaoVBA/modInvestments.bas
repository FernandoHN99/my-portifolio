Attribute VB_Name = "modInvestments"
'==============================================================================
' modInvestments - Lógica de duplicação de investimentos mensais
'==============================================================================
' Duplica últimas linhas quando o mês muda

Option Explicit

' *** MAIN: Atualizar investimentos (ambas as tabelas) ***
Public Sub UpdateInvestments()
    On Error GoTo ErrorHandler
    
    ' Tabela 1: Investimentos_Main
    UpdateInvestmentTable SHEET_INVESTIMENTOS_MAIN, TABLE_INVESTIMENTOS_MAIN
    
    ' Tabela 2: Investimentos_Porcent
    UpdateInvestmentTable SHEET_INVESTIMENTOS_PORCENT, TABLE_INVESTIMENTOS_PORCENT
    
    Exit Sub
    
ErrorHandler:
    MsgBox "Erro ao atualizar investimentos: " & Err.Description
End Sub

' *** HELPER: Atualizar tabela de investimentos individual ***
Private Sub UpdateInvestmentTable(sheetName As String, tableName As String)
    Dim tbl As ListObject
    Dim lastDate As Date
    Dim firstDayMonth As Date
    
    On Error GoTo ErrorHandler
    
    ' Obter tabela
    Set tbl = GetListObject(sheetName, tableName)
    If tbl Is Nothing Then
        Debug.Print "Tabela " & tableName & " não encontrada!"
        Exit Sub
    End If
    
    ' Obter última data
    lastDate = GetLastDateOfData(tbl, COL_INVEST_DATA)
    firstDayMonth = GetFirstDayOfMonth(Date)
    
    ' Se virou o mês, duplicar última leva
    If lastDate < firstDayMonth Then
        DuplicateLastRowsToNewDate tbl, COL_INVEST_DATA, lastDate, firstDayMonth
        Debug.Print "Investimentos duplicados em " & tableName & ": " & lastDate & " -> " & firstDayMonth
    Else
        Debug.Print "Investimentos em " & tableName & " não precisam atualizar (mesmo mês)"
    End If
    
    Exit Sub
    
ErrorHandler:
    Debug.Print "Erro ao atualizar " & tableName & ": " & Err.Description
End Sub
